// Interpretation decisions: the judgement calls Figma data leaves open (what a property is called in code,
// what it means), written down with their evidence, who made them and whether a person accepted them.
// The generator applies them; it never guesses them. AI may propose entries; only a person accepts them.
import { existsSync, readFileSync } from 'node:fs';

import type { FigmaIR, IRComponentSet } from '../ir/types.ts';

export type DecisionStatus = 'proposed' | 'accepted' | 'rejected';

export interface PropDecision {
  /** Code name (camelCase). Omitted: the name generated from Figma stays. */
  name?: string;
  /** What the property does, in plain words, for the docs and the props table. */
  description?: string;
  /** Overrides the set's status for this property. */
  status?: DecisionStatus;
  confidence?: number;
  /** What in the source supports the decision (Figma names, layers, docs text). */
  evidence?: string[];
}

/** Behaviour templates a decision can choose for a component set (when structure and names cannot tell). */
export const ARCHETYPES = ['generic', 'button', 'link', 'checkbox', 'switch', 'disclosure'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export interface SetDecision {
  /** Behaviour: which archetype template builds this set. Omitted: the one discovery chose. */
  archetype?: Archetype;
  /** Used when the Figma component set has no description of its own. */
  description?: string;
  /** Keyed by the Figma property name (as in Figma's property panel, without the #id suffix). */
  props?: Record<string, PropDecision>;
  status: DecisionStatus;
  /** "ai:<model>" or the reviewer's name. */
  by?: string;
  confidence?: number;
  evidence?: string[];
  /** Open questions for a person: what the evidence could not settle. */
  questions?: string[];
  /** Hash of the Figma set the decision was made for: a different hash means Figma changed since. */
  setHash?: string;
}

export interface DecisionsFile {
  $schema?: string;
  version: 1;
  /** Keyed by the Figma component set name. */
  sets: Record<string, SetDecision>;
}

export type ApplyLevel = 'accepted' | 'proposed' | 'none';

export const DECISIONS_FILE = 'ds-sync.decisions.json';
const IDENT = /^[a-z][A-Za-z0-9]*$/;
const RESERVED = new Set(['children', 'className', 'style', 'key', 'ref', 'id', 'disabled', 'class', 'slot', 'part']);

export function emptyDecisions(): DecisionsFile {
  return { $schema: './node_modules/ds-sync/schemas/decisions.schema.json', version: 1, sets: {} };
}

export function loadDecisions(file: string): DecisionsFile | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8')) as DecisionsFile;
}

export interface DecisionProblem {
  set: string;
  prop?: string;
  severity: 'error' | 'warning';
  message: string;
}

/** Shape and cross-checks against the IR: unknown sets or properties, invalid or clashing names, stale entries. */
export function validateDecisions(file: unknown, ir?: FigmaIR): DecisionProblem[] {
  const out: DecisionProblem[] = [];
  const err = (set: string, message: string, prop?: string) => out.push({ set, ...(prop ? { prop } : {}), severity: 'error', message });
  const warn = (set: string, message: string, prop?: string) => out.push({ set, ...(prop ? { prop } : {}), severity: 'warning', message });
  const f = file as Partial<DecisionsFile> | null;
  if (!f || typeof f !== 'object') return [{ set: '', severity: 'error', message: 'Not a JSON object.' }];
  if (f.version !== 1) err('', 'version must be 1.');
  if (!f.sets || typeof f.sets !== 'object') return [...out, { set: '', severity: 'error', message: '"sets" must be an object keyed by Figma component set name.' }];
  const byName = new Map<string, IRComponentSet[]>();
  for (const s of ir?.components ?? []) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);
  for (const [setName, d] of Object.entries(f.sets)) {
    if (!d || typeof d !== 'object') { err(setName, 'Entry must be an object.'); continue; }
    if (!['proposed', 'accepted', 'rejected'].includes(d.status)) err(setName, 'status must be proposed, accepted or rejected.');
    if (d.confidence !== undefined && !(d.confidence >= 0 && d.confidence <= 1)) err(setName, 'confidence must be between 0 and 1.');
    if (d.archetype !== undefined && !(ARCHETYPES as readonly string[]).includes(d.archetype)) err(setName, `archetype must be one of ${ARCHETYPES.join(', ')}.`);
    const sets = byName.get(setName);
    if (ir && !sets) { err(setName, 'No Figma component set has this name (renamed or removed in Figma?).'); continue; }
    if (sets && sets.length > 1) warn(setName, `${sets.length} Figma sets share this name; the decision applies to all of them.`);
    if (sets && d.setHash && !sets.some((s) => s.hash === d.setHash)) warn(setName, 'Figma changed this set since the decision was made: check it is still right.');
    const figmaProps = new Set(sets?.flatMap((s) => s.properties.map((p) => p.name)) ?? []);
    const names = new Map<string, string>();
    for (const [prop, pd] of Object.entries(d.props ?? {})) {
      if (ir && !figmaProps.has(prop)) { err(setName, 'Not a property of this Figma set.', prop); continue; }
      if (pd.status && !['proposed', 'accepted', 'rejected'].includes(pd.status)) err(setName, 'status must be proposed, accepted or rejected.', prop);
      if (pd.name !== undefined) {
        if (!IDENT.test(pd.name)) err(setName, `"${pd.name}" is not a camelCase identifier.`, prop);
        else if (RESERVED.has(pd.name)) err(setName, `"${pd.name}" is reserved (a DOM or framework name).`, prop);
        const other = names.get(pd.name);
        if (other) err(setName, `"${pd.name}" is also the name for "${other}".`, prop);
        names.set(pd.name, prop);
      }
      if (pd.confidence !== undefined && !(pd.confidence >= 0 && pd.confidence <= 1)) err(setName, 'confidence must be between 0 and 1.', prop);
    }
  }
  return out;
}

/** What the generator applies for each set: accepted entries, or also proposed ones when previewing. */
export interface ActiveDecision {
  archetype?: Archetype;
  description?: string;
  props: Map<string, { name?: string; description?: string }>;
  status: DecisionStatus;
}

let ACTIVE = new Map<string, ActiveDecision>();

export function activeDecisions(file: DecisionsFile | undefined, level: ApplyLevel): Map<string, ActiveDecision> {
  const out = new Map<string, ActiveDecision>();
  if (!file || level === 'none') return out;
  const ok = (s: DecisionStatus | undefined) => s === 'accepted' || (level === 'proposed' && s === 'proposed');
  for (const [setName, d] of Object.entries(file.sets)) {
    const props = new Map<string, { name?: string; description?: string }>();
    for (const [prop, pd] of Object.entries(d.props ?? {})) {
      if (!ok(pd.status ?? d.status)) continue;
      props.set(prop, { ...(pd.name ? { name: pd.name } : {}), ...(pd.description ? { description: pd.description } : {}) });
    }
    const description = ok(d.status) ? d.description : undefined;
    const archetype = ok(d.status) ? d.archetype : undefined;
    if (props.size || description || archetype) out.set(setName, { ...(archetype ? { archetype } : {}), ...(description ? { description } : {}), props, status: d.status });
  }
  return out;
}

/** Makes decisions visible to the templates for one generation run. */
export function setActiveDecisions(map: Map<string, ActiveDecision>): void {
  ACTIVE = map;
}

/** Code name decided for a Figma property of a set, if any. */
export function decidedName(set: Pick<IRComponentSet, 'name'>, figmaProp: string): string | undefined {
  return ACTIVE.get(set.name)?.props.get(figmaProp)?.name;
}

/** Description decided for a Figma property of a set, if any. */
export function decidedDescription(set: Pick<IRComponentSet, 'name'>, figmaProp: string): string | undefined {
  return ACTIVE.get(set.name)?.props.get(figmaProp)?.description;
}

export function decidedSetDescription(set: Pick<IRComponentSet, 'name'>): string | undefined {
  return ACTIVE.get(set.name)?.description;
}

/** Merges one AI proposal into the file. Accepted or rejected entries are never overwritten. */
export function mergeProposal(file: DecisionsFile, setName: string, proposal: SetDecision): 'added' | 'updated' | 'kept' {
  const current = file.sets[setName];
  if (current && current.status !== 'proposed') return 'kept';
  file.sets[setName] = { ...proposal, status: 'proposed' };
  return current ? 'updated' : 'added';
}

/** Lines for GENERATION-REPORT.md. */
export function decisionsReport(file: DecisionsFile | undefined, level: ApplyLevel, problems: DecisionProblem[]): string[] {
  if (!file) return [];
  const sets = Object.values(file.sets);
  const count = (s: DecisionStatus) => sets.filter((d) => d.status === s).length;
  const applied = activeDecisions(file, level);
  const renamed = [...applied.values()].reduce((n, d) => n + [...d.props.values()].filter((p) => p.name).length, 0);
  const described = [...applied.values()].reduce((n, d) => n + [...d.props.values()].filter((p) => p.description).length, 0);
  return [
    '## Decisions',
    '',
    `From \`${DECISIONS_FILE}\`: ${sets.length} component set(s): ${count('accepted')} accepted, ${count('proposed')} proposed, ${count('rejected')} rejected.`,
    level === 'proposed'
      ? `**Preview: proposed decisions are applied too** (\`--decisions proposed\`). Accept them before publishing.`
      : level === 'none' ? 'Decisions were not applied (`--decisions none`).' : 'Only accepted decisions are applied.',
    `Applied: ${renamed} property name(s) and ${described} description(s) in ${applied.size} set(s).`,
    ...(problems.length ? ['', ...problems.map((p) => `- ${p.severity === 'error' ? '**Error**' : 'Warning'}: ${p.set}${p.prop ? ` › ${p.prop}` : ''}: ${p.message}`)] : []),
    '',
  ];
}
