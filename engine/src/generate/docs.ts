// Documentation pass (fidelity roadmap step 6): every component's Storybook entry follows docs/fidelity/STANDARD.md.
// Runs after the templates, for React and Web Components alike: plain-language story names, test-only stories and
// building blocks kept out of the sidebar, and one tiered documentation page per component.
import type { IRComponentSet } from '../ir/types.ts';
import type { ComponentReport } from './templates/common.ts';
import { leadSentence } from './templates/common.ts';
import type { GenericCore, InstanceProp } from './templates/generic.ts';

const js = (v: unknown) => JSON.stringify(v);
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** "IsDisabledAndState" or "isDisabled and state" -> "Disabled and state"; "ShowFooter" -> "With footer". */
export function plainLabel(text: string): string {
  if (text === 'Options') return 'Optional parts';
  if (text === 'FigmaVariants') return 'Figma variants';
  const words = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[\s_]+/).filter(Boolean);
  const groups: string[][] = [[]];
  for (const w of words) (w.toLowerCase() === 'and' ? groups.push([]) : groups[groups.length - 1]!.push(w));
  const out = groups.filter((g) => g.length).map((g) => {
    const [first, ...rest] = g;
    const lower = (xs: string[]) => xs.map((x) => (/^[A-Z0-9]{2,}$/.test(x) ? x : x.toLowerCase()));
    if (/^is$/i.test(first!) && rest.length) return lower(rest).join(' ');
    if (/^(has|show|with)$/i.test(first!) && rest.length) return `with ${lower(rest).join(' ')}`;
    return lower(g).join(' ');
  }).join(' and ');
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : text;
}

/** Figma's own convention for components not meant to be used directly: "_name", ".name", and "… Base". */
export const isBuildingBlock = (setName: string) => {
  const n = setName.trim().replace(/[^A-Za-z0-9]+$/, '');
  return /^[_.]/.test(setName.trim()) || /(?:^|[\s_\-/])base$/i.test(n) || /[a-z]Base$/.test(n);
};

/** Docs page link from inside the docs iframe. */
export const docsLink = (title: string) => `./?path=/docs/${slug(title)}--docs`;

/** Template docs sections (heading + story) from the page the template wrote. */
export function templateSections(mdx: string): { heading: string; story: string; note?: string }[] {
  const out: { heading: string; story: string; note?: string }[] = [];
  for (const m of mdx.matchAll(/^## (.+)\n\n(?:((?!<Canvas)[^\n]+)\n\n)?<Canvas of=\{Stories\.(\w+)\} \/>/gm)) {
    if (m[3] === 'Default') continue;
    out.push({ heading: m[1]!, story: m[3]!, ...(m[2] ? { note: m[2] } : {}) });
  }
  return out;
}

/** Story names, sidebar visibility, and no stray type exports. */
export function polishStories(content: string, o: { name: string; documented: Set<string>; buildingBlock: boolean }): string {
  let s = content
    .replace(/\n\/\/ Keep the type import used even when no lookup tables are generated\.\nexport type \{ \w+Props \};\n/, '\n')
    .replace(/\nexport type \{ \w+Props \};\n/, '\n');
  if (!new RegExp(`\\b${o.name}Props\\b`).test(s.replace(/^import[^\n]*\n/gm, ''))) s = s.replace(`, type ${o.name}Props }`, ' }');
  const starts = [...s.matchAll(/^export const (\w+): Story = \{\n/gm)];
  for (const m of starts.reverse()) {
    const name = m[1]!;
    const at = m.index! + m[0].length;
    const end = s.indexOf('\nexport const ', at);
    const block = s.slice(at, end < 0 ? s.length : end);
    const testOnly = name === 'FigmaVariants' || (name !== 'Default' && !o.documented.has(name) && /\n  play: /.test(`\n${block}`));
    let insert = /^\s*name: /m.test(block.split('\n').slice(0, 3).join('\n')) ? '' : `  name: ${js(plainLabel(name))},\n`;
    let rest = block;
    if (testOnly) {
      if (/^  tags: \[/m.test(block)) rest = block.replace(/^  tags: \[/m, "  tags: ['!dev', ");
      else insert += "  tags: ['!dev'],\n";
    }
    s = s.slice(0, at) + insert + rest + s.slice(at + block.length);
  }
  // Building blocks: built and tested, documented in their parent's Composition section, not listed in the sidebar.
  if (o.buildingBlock) s = s.replace(/^const meta = \{\n/m, "const meta = {\n  tags: ['!dev'],\n");
  return s;
}

export interface CompositionRow {
  component: string;
  title?: string;
  buildingBlock?: boolean;
  layer: string;
  count: number;
  /** Nested props and the parent props that decide them. */
  driven: { prop: string; from: string[] }[];
  fixed: string[];
}

/** How this component configures the components it contains (from the nested mapping, roadmap step 3). */
export function composition(core: GenericCore | undefined, componentOf: (componentId: string) => { name: string; title: string; buildingBlock: boolean } | undefined): CompositionRow[] {
  if (!core?.layers) return [];
  const rows: CompositionRow[] = [];
  for (const l of core.layers) {
    const p = l.part;
    if (p.type !== 'INSTANCE' || !p.instanceComponentId) continue;
    const c = componentOf(p.instanceComponentId);
    if (!c || c.name === undefined) continue;
    const props: InstanceProp[] = core.nestedProps?.get(p) ?? [];
    rows.push({
      component: c.name,
      title: c.title,
      buildingBlock: c.buildingBlock,
      layer: p.name,
      count: 1 + (l.copies?.length ?? 0),
      driven: props.filter((x): x is Extract<InstanceProp, { kind: 'expr' }> => x.kind === 'expr').map((x) => ({ prop: x.prop, from: x.from ?? [] })),
      fixed: props.filter((x) => x.kind === 'string' || x.kind === 'boolean').map((x) => `${x.prop}=${js(x.value)}`),
    });
  }
  return rows;
}

export interface DocsInput {
  name: string;
  title: string;
  framework: 'react' | 'wc';
  /** 1 display, 2 interactive, 3 composite (STANDARD.md section 3). */
  tier: 1 | 2 | 3;
  sets: IRComponentSet[];
  fileKey: string;
  version: string;
  report: ComponentReport;
  composition: CompositionRow[];
  exposed: { prop: string; layer: string; figma: string; component: string }[];
  /** The page the template wrote: its variant sections (and, for Web Components, the usage and Figma docs blocks) are reused. */
  templateMdx: string;
  buildingBlock: boolean;
  usedIn: { name: string; title: string }[];
  knownIssues: string[];
  modes: string[];
  packageName: string;
  visual?: { match: number; total: number; worst: number };
  /** Plain-language descriptions by code prop, from applied decisions. */
  descriptions?: Record<string, string>;
  /** Component description from an applied decision, used when Figma has none. */
  decidedDescription?: string;
}

const GROUPS = ['Appearance', 'Content', 'State', 'Behaviour', 'Composition'] as const;
function groupOf(m: ComponentReport['props'][number]): (typeof GROUPS)[number] {
  if (/\(exposed nested instance\)|\(instance swap\)/.test(m.figma)) return 'Composition';
  if (/^State=|^States?:/.test(m.figma) || (m.note ?? '').startsWith('States:') || /checked|expanded|selected|disabled/i.test(m.prop)) return 'State';
  if (/\(variant\)/.test(m.figma)) return 'Appearance';
  if (/\((boolean|text|text layer)\)/.test(m.figma) || /\+ label text/.test(m.figma)) return 'Content';
  return 'Behaviour';
}

const p = (text: string) => `<p>{${js(text)}}</p>`;
const list = (items: string[]) => `<ul>${items.map((i) => `<li>{${js(i)}}</li>`).join('')}</ul>`;

export function docsPage(d: DocsInput): string {
  const sets = d.sets;
  const figmaDescription = sets.map((s) => s.description).find((x) => x?.trim()) ?? leadSentence(sets.flatMap((s) => s.docFrames));
  const description = figmaDescription || d.decidedDescription;
  const fromDecision = !figmaDescription && Boolean(d.decidedDescription);
  const sections = templateSections(d.templateMdx);
  const out: string[] = [];
  const header = d.framework === 'react'
    ? `{/* Generated by ds-sync from Figma. Do not edit by hand; edit the Figma docs or the generator. */}
import { Meta, Title, Canvas, Controls, Source } from '@storybook/addon-docs/blocks';
import * as Stories from './${d.name}.stories';
import { FigmaDocs } from '../../storybook/FigmaDocs';
import docs from './${d.name}.figma.json';`
    : `{/* Generated by ds-sync from Figma. Do not edit by hand; edit the Figma docs or the generator. */}
import { Meta, Title, Canvas, Controls, Source } from '@storybook/addon-docs/blocks';
import * as Stories from './${d.name}.stories';`;
  out.push(header, '', d.buildingBlock ? "<Meta of={Stories} tags={['!dev']} />" : '<Meta of={Stories} />', '', `<Title>${d.name}</Title>`, '');

  // Overview
  out.push('## Overview', '');
  out.push(description ? p(description) : `<p><strong>No description in Figma.</strong> Add one to the component set's description in Figma; it appears here on the next sync.</p>`);
  if (fromDecision) out.push('<p><small>Description from ds-sync.decisions.json (Figma has none).</small></p>');
  if (d.buildingBlock) {
    out.push(`<p>{${js(`Building block${d.usedIn.length ? ` of ${d.usedIn.map((u) => u.name).join(', ')}` : ''}: Figma marks it as internal (its name starts with "_" or "." or ends with "Base"), so it is not listed in the sidebar. Use the parent component unless you are composing your own.`)}}</p>`);
    if (d.usedIn.length) out.push(`<p>Used in: ${d.usedIn.map((u) => `<a href=${js(docsLink(u.title))} target="_top">{${js(u.name)}}</a>`).join(', ')}</p>`);
  }
  out.push('');

  // Preview
  out.push('## Preview', '', 'The default configuration (every property at its Figma default).', '', '<Canvas of={Stories.Default} sourceState="shown" />', '');

  // Variants (designed variants, grouped by property)
  if (sections.length) {
    out.push('## Variants', '');
    for (const s of sections) out.push(`### ${plainLabel(s.heading)}`, '', ...(s.note ? [s.note, ''] : []), `<Canvas of={Stories.${s.story}} />`, '');
  }

  // Properties
  const rows = d.report.props.filter((m) => m.prop !== '—' || /instance swap/.test(m.figma));
  if (rows.length) {
    out.push('## Properties', '');
    for (const g of GROUPS) {
      const gr = rows.filter((m) => groupOf(m) === g);
      if (!gr.length) continue;
      out.push(`### ${g}`, '', `<table><thead><tr><th scope="col">Property</th><th scope="col">Code</th><th scope="col">Figma</th><th scope="col">Notes</th></tr></thead><tbody>${gr
        .map((m) => `<tr><td>{${js(m.prop === '—' ? m.figma.replace(/ \(.*\)$/, '') : plainLabel(m.prop))}}</td><td>${m.prop === '—' ? '—' : `<code>{${js(m.prop)}}</code>`}</td><td>{${js(m.figma)}}</td><td>{${js([d.descriptions?.[m.prop], m.note].filter(Boolean).join(' '))}}</td></tr>`)
        .join('')}</tbody></table>`, '');
    }
    out.push('### Try it', '', '<Controls of={Stories.Default} />', '');
  }

  // States
  const states = d.report.props.flatMap((m) => ((m.note ?? '').startsWith('States:') ? [`${m.figma.replace(/ \(variant\)$/, '')}: ${m.note!.slice(8).trim()}`] : []));
  if (states.length && d.tier >= 2) out.push('## States', '', list(states), p('Hover, pressed and focus come from CSS when you interact; the variant stories show them statically.'), '');

  // Behaviour and keyboard
  const behaviour = d.report.assumptions.filter((a) => /WAI-ARIA|keyboard|Escape|Space|Enter|arrow|focus|click/i.test(a));
  if (d.tier >= 2 && behaviour.length) out.push('## Behaviour and keyboard', '', list(behaviour), '');

  // Composition
  if (d.composition.length || d.exposed.length) {
    out.push('## Composition', '');
    if (d.composition.length) {
      out.push(`<table><thead><tr><th scope="col">Contains</th><th scope="col">Layer</th><th scope="col">How ${d.name} configures it</th></tr></thead><tbody>${d.composition
        .map((r) => {
          const how = [...r.driven.map((x) => (x.from.length === 1 && x.from[0] === x.prop ? `${x.prop}: passed through` : `${x.prop}: follows ${x.from.join(' and ')}`)), ...r.fixed.map((f) => `${f} (fixed)`)].join('; ') || 'Its own defaults';
          const name = r.title ? `<a href=${js(docsLink(r.title))} target="_top">{${js(r.component)}}</a>` : `{${js(r.component)}}`;
          return `<tr><td>${name}${r.count > 1 ? ` ×${r.count}` : ''}</td><td>{${js(r.layer)}}</td><td>{${js(how)}}</td></tr>`;
        })
        .join('')}</tbody></table>`, '');
      out.push(p('"Follows" values are what Figma sets on the nested component in each variant of this one; the Design reference section reports how many were checked.'), '');
    }
    if (d.exposed.length) {
      out.push(p(`Exposed in Figma: these properties belong to nested components, and Figma shows them on ${d.name}'s own property panel, so they are ${d.name} properties.`));
      out.push(list(d.exposed.map((e) => `${e.prop}: ${e.figma} on the nested ${e.component} (layer "${e.layer}")`)), '');
    }
  }

  // Accessibility
  const a11y = [
    ...d.report.assumptions.filter((a) => /role|aria|accessible|label|not focusable|not specified/i.test(a) && !behaviour.includes(a)),
    ...d.report.gaps.filter((g) => /accessible name|aria-label|label/i.test(g)),
    ...d.knownIssues,
    `Every story is checked with axe in each Figma mode${d.modes.length ? ` (${d.modes.join(', ')})` : ''}.`,
  ];
  out.push('## Accessibility', '', list([...new Set(a11y)]), '');

  // Code
  out.push('## Code', '');
  if (d.framework === 'react') {
    out.push(`<Source language="tsx" dark code={${js(`import { ${d.name} } from '${d.packageName}';\nimport '${d.packageName}/tokens.css';\n\n<${d.name} />`)}} />`, '', 'Each story shows its code under "Show code".', '');
  } else {
    const usage = /## Use it in your app\n([\s\S]*?)(?=\n## |\n<h2>|$)/.exec(d.templateMdx)?.[1];
    if (usage) out.push(usage.trim(), '');
  }

  // Design reference
  out.push('## Design reference', '');
  const link = (nodeId: string) => `https://www.figma.com/design/${d.fileKey}?node-id=${nodeId.replace(':', '-')}`;
  const ref = [
    `<li>Figma: ${sets.map((s) => `<a href=${js(link(s.nodeId))}>{${js(s.name)}}</a>`).join(', ')} · version ${d.version} · ${sets.reduce((n, s) => n + s.variants.length, 0)} designed variants</li>`,
    ...(d.report.nested ? [`<li>{${js(`Nested consistency: ${d.report.nested.matched}/${d.report.nested.checked} nested values match Figma (${d.report.nested.layers} nested component layers; ${d.report.nested.stateVariants} state variants not compared).`)}}</li>`] : []),
    `<li>{${js(d.visual ? `Visual check: ${d.visual.match}/${d.visual.total} variants match Figma (worst difference ${d.visual.worst}%).` : 'Visual check: not run for this version yet ("ds-sync visual").')}}</li>`,
  ];
  out.push(`<ul>${ref.join('')}</ul>`, '');
  const notes = [...d.report.assumptions.filter((a) => !behaviour.includes(a) && !a11y.includes(a)), ...d.report.gaps.filter((g) => !a11y.includes(g))];
  if (notes.length) out.push(`<details>\n  <summary>Generation notes: what Figma does not specify, and approximations</summary>\n  ${list(notes)}\n</details>`, '');
  if (d.framework === 'react') out.push('<FigmaDocs docs={docs} only="tabs" />', '');
  else {
    const tabs = d.templateMdx.indexOf('\n<h2>{');
    if (tabs >= 0) out.push(d.templateMdx.slice(tabs + 1).trim(), '');
  }
  return out.join('\n');
}
