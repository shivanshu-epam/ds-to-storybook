// Component scorecards (docs/fidelity/QUALITY.md section 3, roadmap step 12): one line per fidelity measure, each with
// its own status and evidence. No weighted total: a release is gated per measure, so one broken measure is never hidden.
import type { IRComponentSet } from '../ir/types.ts';
import type { ComponentReport } from './templates/common.ts';

export type MeasureStatus = 'pass' | 'warn' | 'fail' | 'n/a';

export interface Measure {
  /** Measure name, as in QUALITY.md. */
  name: 'Visual fidelity' | 'Variants' | 'Properties' | 'Nested consistency' | 'Interaction' | 'Tokens' | 'Accessibility' | 'Documentation' | 'Open decisions';
  status: MeasureStatus;
  /** One line of evidence, for example "21/24 designed variants match". */
  value: string;
}

export interface Scorecard {
  component: string;
  template: string;
  figma: { sets: string[]; nodeIds: string[] };
  buildingBlock: boolean;
  measures: Measure[];
}

export interface ScorecardInput {
  name: string;
  template: string;
  sets: IRComponentSet[];
  report: ComponentReport;
  css: string;
  buildingBlock: boolean;
  visual?: { match: number; total: number; worst: number };
  knownIssues: number;
  /** Open questions recorded in ds-sync.decisions.json for these sets. */
  questions: number;
  /** A component description exists (Figma, its docs frames, or an applied decision). */
  described: boolean;
  /** Props with a plain-language description (from decisions). */
  describedProps: number;
  /** A composite whose repeated items have a behaviour template: that behaviour. */
  itemBehaviour?: string;
}

const BEHAVIOUR: Record<string, string> = {
  action: 'WAI-ARIA button', button: 'WAI-ARIA button', link: 'WAI-ARIA link', checkbox: 'WAI-ARIA checkbox', 'checkbox-single': 'WAI-ARIA checkbox',
  switch: 'WAI-ARIA switch', 'radio-single': 'WAI-ARIA radio', accordion: 'WAI-ARIA accordion', disclosure: 'WAI-ARIA disclosure', radio: 'WAI-ARIA radio', 'radio-field': 'WAI-ARIA radio (label)',
  'radio-group': 'WAI-ARIA radio group', 'collection:tablist': 'WAI-ARIA tabs', 'collection:radiogroup': 'WAI-ARIA radio group', 'collection:group': 'WAI-ARIA group', input: 'native input', dialog: 'WAI-ARIA dialog',
};
const INTERACTIVE_NAME = /button|link|\btabs?\b|tabs?(item)?$|menu|select|dropdown|toggle|switch|checkbox|radio|accordion|collapsible|input|slider|chip|pagination/i;

export { BEHAVIOUR };

export function buildScorecard(x: ScorecardInput): Scorecard {
  const m: Measure[] = [];
  // 1. Visual fidelity: only when ds-sync visual ran for this Figma version.
  if (x.visual?.total) {
    const pct = x.visual.match / x.visual.total;
    m.push({ name: 'Visual fidelity', status: pct >= 0.95 && x.visual.worst <= 10 ? 'pass' : pct >= 0.5 ? 'warn' : 'fail', value: `${x.visual.match}/${x.visual.total} designed variants match Figma (worst ${x.visual.worst.toFixed(1)}%)` });
  } else m.push({ name: 'Visual fidelity', status: 'n/a', value: 'not measured: run ds-sync visual' });
  // 2. Variants: every designed variant is in the Figma Variants story; undesigned combinations are labelled.
  const designed = x.sets.reduce((n, s) => n + s.variants.length, 0);
  const possible = x.sets.reduce((n, s) => n + s.properties.filter((p) => p.type === 'VARIANT').reduce((k, p) => k * (p.options?.length ?? 1), 1), 0);
  m.push({ name: 'Variants', status: 'pass', value: `${designed} designed variants shown${possible > designed ? `; ${possible - designed} computed combinations labelled` : ''}` });
  // 3. Properties: every Figma property maps to a prop, or is listed as unsupported.
  const rows = x.report.props.filter((p) => !/\(layer\)|^—$/.test(p.figma));
  const unmapped = rows.filter((p) => p.prop === '—' && !/^States:/.test(p.note ?? '') && !/\(variant\)$/.test(p.figma));
  const mapped = rows.length - unmapped.length;
  m.push({ name: 'Properties', status: unmapped.length ? 'warn' : 'pass', value: `${mapped}/${rows.length} Figma properties mapped${unmapped.length ? `; not exposed: ${unmapped.map((p) => p.figma.replace(/ \(.*\)$/, '')).join(', ')}` : ''}` });
  // 4. Nested consistency.
  const n = x.report.nested;
  if (n?.checked) m.push({ name: 'Nested consistency', status: n.matched === n.checked ? 'pass' : 'fail', value: `${n.matched}/${n.checked} nested values match Figma (${n.layers} nested layers)` });
  else m.push({ name: 'Nested consistency', status: 'n/a', value: 'no nested components' });
  // 5. Interaction: a behaviour contract tested in the stories, or none.
  const behaviour = BEHAVIOUR[x.template];
  if (behaviour) m.push({ name: 'Interaction', status: 'pass', value: `${behaviour} pattern, tested in the stories` });
  else if (x.itemBehaviour) m.push({ name: 'Interaction', status: 'pass', value: `behaviour comes from its items (${x.itemBehaviour})` });
  else m.push({ name: 'Interaction', status: INTERACTIVE_NAME.test(x.name) && !x.buildingBlock ? 'warn' : 'n/a', value: INTERACTIVE_NAME.test(x.name) && !x.buildingBlock ? 'visuals only: the name suggests behaviour that no template provides (add an archetype decision)' : 'visuals only (display component)' });
  // 6. Tokens: raw colours left in the component CSS (outside var()).
  const raw = (x.css.replace(/var\([^)]*\)/g, '').match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []).length;
  m.push({ name: 'Tokens', status: raw === 0 ? 'pass' : 'warn', value: raw === 0 ? 'every colour is a token' : `${raw} raw colour value${raw === 1 ? '' : 's'} (not bound to a variable in Figma)` });
  // 7. Accessibility: the story tests run axe in every Figma mode; generation knows accepted issues and missing names.
  const names = x.report.gaps.filter((g) => /accessible name|aria-label|no label/i.test(g)).length;
  m.push({ name: 'Accessibility', status: x.knownIssues || names ? 'warn' : 'pass', value: [`axe in every Figma mode${x.knownIssues ? `; ${x.knownIssues} accepted known issue${x.knownIssues === 1 ? '' : 's'}` : ''}`, ...(names ? [`${names} accessible-name note${names === 1 ? '' : 's'} to confirm`] : [])].join('; ') });
  // 8. Documentation: a description, and props described in plain words.
  const props = rows.filter((p) => p.prop !== '—').length;
  const docOk = x.described && (props === 0 || x.describedProps >= props);
  m.push({ name: 'Documentation', status: docOk ? 'pass' : x.described || x.describedProps ? 'warn' : 'fail', value: `${x.described ? 'description' : 'no description'}; ${x.describedProps}/${props} props described` });
  // 9. Open decisions: questions for a person, and gaps the generator reported.
  const gaps = x.report.gaps.length;
  m.push({ name: 'Open decisions', status: x.questions || gaps ? 'warn' : 'pass', value: `${x.questions} open question${x.questions === 1 ? '' : 's'}; ${gaps} generator note${gaps === 1 ? '' : 's'}` });
  return { component: x.name, template: x.template, figma: { sets: x.sets.map((s) => s.name), nodeIds: x.sets.map((s) => s.nodeId) }, buildingBlock: x.buildingBlock, measures: m };
}

const ICON: Record<MeasureStatus, string> = { pass: '✓', warn: '⚠', fail: '✗', 'n/a': '–' };

/** GENERATION-REPORT.md section: one row per public component, one column per measure. */
export function scorecardReport(cards: Scorecard[]): string[] {
  if (!cards.length) return [];
  const names = cards[0]!.measures.map((x) => x.name);
  const pub = cards.filter((c) => !c.buildingBlock);
  const count = (s: MeasureStatus) => pub.reduce((n, c) => n + c.measures.filter((x) => x.status === s).length, 0);
  return [
    '## Scorecards',
    '',
    `One line per fidelity measure (docs/fidelity/QUALITY.md); ✓ pass, ⚠ needs a look, ✗ fails, – not applicable or not measured. No overall score: each measure is gated on its own. Public components: ${pub.length}; ${count('pass')} ✓, ${count('warn')} ⚠, ${count('fail')} ✗. Full detail in \`scorecard.json\`; building blocks are in the file, not this table.`,
    '',
    `| Component | ${names.join(' | ')} |`,
    `| --- | ${names.map(() => '---').join(' | ')} |`,
    ...pub.map((c) => `| ${c.component} | ${c.measures.map((x) => ICON[x.status]).join(' | ')} |`),
    '',
  ];
}

/** Lines for one component's docs page (Design reference). */
export function scorecardLines(card: Scorecard): string[] {
  return card.measures.map((x) => `${ICON[x.status]} ${x.name}: ${x.value}`);
}
