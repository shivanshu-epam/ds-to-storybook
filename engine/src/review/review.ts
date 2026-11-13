// The work list for interpretation: one evidence file per component, with everything a reviewer (a person or the
// interpret-component skill) needs to decide code names and descriptions, and nothing else. Deterministic.
import { join } from 'node:path';

import { setActiveDecisions, type DecisionsFile } from '../decisions/decisions.ts';
import type { Discovery } from '../discover/discover.ts';
import { isBuildingBlock } from '../generate/docs.ts';
import { propPlan } from '../generate/templates/generic.ts';
import type { FigmaIR, IRComponentSet } from '../ir/types.ts';
import { writeJson, writeText } from '../util/core.ts';

export interface ReviewProperty {
  figma: string;
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  default: string | boolean;
  options?: string[];
  /** Name the generator uses today without a decision ("—" for instance swaps, which are not props yet). */
  generatedName: string;
  /** How the generator reads it: a variant prop, a CSS state, a boolean or a text. */
  generatedAs: 'variant' | 'state' | 'boolean' | 'text' | 'instance swap';
}

export interface ReviewLayer {
  path: string;
  type: string;
  instanceOf?: string;
  text?: string;
  /** Component properties bound to the layer. */
  boundTo?: string[];
  hidden?: boolean;
  exposed?: boolean;
}

export interface ReviewSet {
  name: string;
  role: string;
  nodeId: string;
  hash: string;
  description: string;
  variants: number;
  properties: ReviewProperty[];
  /** Layers of the default variant (outline, at most 80). */
  layers: ReviewLayer[];
}

export interface ReviewItem {
  schema: 'ds-sync/review@1';
  component: string;
  page: string;
  template: string;
  buildingBlock: boolean;
  sets: ReviewSet[];
  /** Text of the Figma documentation frames (first 4,000 characters). */
  docsText: string;
  /** Other components this one contains. */
  contains: string[];
  /** Deterministic hints: patterns worth a decision. Hints, not answers. */
  hints: string[];
  /** What a decision may and may not contain. */
  contract: string[];
}

const CONTRACT = [
  'Answer with one decision object per Figma set (sets[].name), in the JSON shape of the decisions schema.',
  'props keys must be Figma property names from sets[].properties[].figma; leave out properties whose generated name is already right.',
  'name: the camelCase prop name a design-system engineer would use in code (React conventions: isDisabled, isChecked, size, variant). Only rename when the evidence supports it.',
  'description: one plain sentence saying what the property does, from the evidence. No marketing words, no guesses about behaviour Figma does not show.',
  'description (set level): one or two sentences on what the component is for, only when Figma has no description.',
  'Every name and description needs evidence: quote the Figma names, layers or docs text it rests on.',
  'confidence 0 to 1. Below 0.7, also add a question for a person.',
  'Never invent properties, values, behaviour or copy. What the evidence cannot settle goes in questions.',
];

function hintsFor(set: IRComponentSet, props: ReviewProperty[]): string[] {
  const out: string[] = [];
  const words = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const swaps = props.filter((p) => p.type === 'INSTANCE_SWAP');
  for (const b of props.filter((p) => p.type === 'BOOLEAN')) {
    const w = words(b.figma).filter((x) => !['show', 'has', 'with', 'is'].includes(x));
    const pair = swaps.find((s) => w.length && w.every((x) => words(s.figma).includes(x)));
    if (pair) out.push(`"${b.figma}" (boolean) and "${pair.figma}" (instance swap) look like one slot: a visibility toggle and its content.`);
  }
  for (const p of props) {
    if (p.type === 'VARIANT' && /screen|device|breakpoint|viewport|platform/i.test(p.figma)) out.push(`"${p.figma}" (${(p.options ?? []).join(', ')}) looks like a viewport or platform, not a component option.`);
    if (p.generatedAs === 'state' && p.generatedName === 'disabled') out.push(`"${p.figma}" is the disabled state: the generator makes it the \`disabled\` prop.`);
    else if (p.generatedAs === 'state') out.push(`"${p.figma}" is treated as interaction states (${(p.options ?? []).join(', ')}): CSS states in code, not a prop.`);
    if (p.type === 'VARIANT' && (p.options ?? []).every((o) => /^(true|false)$/i.test(o)) && !/^(is|has|show|with)/i.test(p.figma)) out.push(`"${p.figma}" is a True/False variant: a boolean prop, usually named is…/has….`);
    if (/\s|[A-Z].*[A-Z].*[A-Z]/.test(p.figma) && p.figma.length > 24) out.push(`"${p.figma}" is a long Figma name: the code name may be shorter.`);
  }
  if (!set.description.trim()) out.push('Figma has no description for this set.');
  return out;
}

export function buildReview(ir: FigmaIR, discovery: Discovery): ReviewItem[] {
  // Evidence shows what the generator does without decisions.
  setActiveDecisions(new Map());
  const byNode = new Map(ir.components.map((s) => [s.nodeId, s]));
  const items: ReviewItem[] = [];
  for (const prop of discovery.proposals) {
    const sets = Object.entries(prop.sets).map(([role, id]) => ({ role, set: byNode.get(id) })).filter((x): x is { role: string; set: IRComponentSet } => Boolean(x.set));
    if (!sets.length) continue;
    const reviewSets = sets.map<ReviewSet>(({ role, set }) => {
      const plan = propPlan(set);
      const properties = set.properties.map<ReviewProperty>((p) => {
        const axis = plan.axes.find((a) => a.figma === p.name);
        const b = plan.booleans.find((x) => x.p.name === p.name);
        const t = plan.texts.find((x) => x.p.name === p.name);
        return {
          figma: p.name, type: p.type, default: p.default, ...(p.options ? { options: p.options } : {}),
          generatedName: axis?.values.some((v) => v.role === 'disabled') ? 'disabled' : axis?.prop ?? b?.prop ?? t?.prop ?? '—',
          generatedAs: axis ? axis.kind : b ? 'boolean' : t ? 'text' : 'instance swap',
        };
      });
      const dv = set.variants.find((v) => set.properties.filter((p) => p.type === 'VARIANT').every((p) => v.values[p.name] === String(p.default))) ?? set.variants[0];
      const layers = (dv?.parts ?? []).slice(0, 80).map<ReviewLayer>((l) => {
        const bound = Object.values(l.refs ?? {}).filter(Boolean) as string[];
        return {
          path: l.path, type: l.type,
          ...(l.instanceOf ? { instanceOf: l.instanceOf } : {}),
          ...(l.text ? { text: l.text.slice(0, 80) } : {}),
          ...(bound.length ? { boundTo: bound } : {}),
          ...(l.hidden ? { hidden: true } : {}),
          ...(l.exposed ? { exposed: true } : {}),
        };
      });
      return { name: set.name, role, nodeId: set.nodeId, hash: set.hash, description: set.description, variants: set.variants.length, properties, layers };
    });
    const contains = [...new Set(sets.flatMap(({ set }) => set.variants.flatMap((v) => v.parts.filter((p) => p.type === 'INSTANCE' && p.instanceOf && !p.icon).map((p) => p.instanceOf!))))].slice(0, 30);
    items.push({
      schema: 'ds-sync/review@1',
      component: prop.name,
      page: prop.page,
      template: prop.template,
      buildingBlock: isBuildingBlock(sets[0]!.set.name),
      sets: reviewSets,
      docsText: sets.flatMap(({ set }) => set.docFrames.flatMap((f) => [`# ${f.name}`, ...f.blocks.map((b) => b.text)])).join('\n').slice(0, 4000),
      contains,
      hints: sets.flatMap(({ set }, i) => hintsFor(set, reviewSets[i]!.properties)),
      contract: CONTRACT,
    });
  }
  return items;
}

export interface ReviewIndexEntry {
  component: string;
  file: string;
  sets: { name: string; hash: string }[];
  /** A decision exists for every set, made for the current Figma content. */
  decided: boolean;
  buildingBlock: boolean;
}

export function writeReview(outDir: string, items: ReviewItem[], decisions: DecisionsFile | undefined): ReviewIndexEntry[] {
  const dir = join(outDir, 'review');
  const index = items.map<ReviewIndexEntry>((it) => {
    const file = join(dir, `${it.component}.json`);
    writeJson(file, it);
    const decided = it.sets.every((s) => {
      const d = decisions?.sets[s.name];
      return Boolean(d && (d.status !== 'proposed' || d.setHash === s.hash));
    });
    return { component: it.component, file, sets: it.sets.map((s) => ({ name: s.name, hash: s.hash })), decided, buildingBlock: it.buildingBlock };
  });
  writeJson(join(dir, 'index.json'), index);
  const open = index.filter((x) => !x.decided);
  writeText(join(dir, 'README.md'), [
    '# Interpretation work list',
    '',
    `${index.length} component(s); ${index.length - open.length} decided, ${open.length} open.`,
    '',
    'Each file is the evidence for one component. Answer it with `ds-sync interpret` (Claude, headless), with the `interpret-component` skill in a Claude Code session, or by hand in `ds-sync.decisions.json`. Then accept the proposals you agree with.',
    '',
    ...open.map((x) => `- ${x.component}${x.buildingBlock ? ' (building block)' : ''}: \`${x.file}\``),
    '',
  ].join('\n'));
  return index;
}
