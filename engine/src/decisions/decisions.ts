// Interpretation decisions: the judgement calls Figma data leaves open (what a property is called in code,
// what it means), written down with their evidence, who made them and whether a person accepted them.
// The generator applies them; it never guesses them. AI may propose entries; only a person accepts them.
import { existsSync, readFileSync } from 'node:fs';

import type { FigmaIR, IRComponentSet } from '../ir/types.ts';
import { JS_RESERVED } from '../util/reserved.ts';

export type DecisionStatus = 'proposed' | 'accepted' | 'rejected';

export interface PropDecision {
  /** Code name (camelCase). Omitted: the name generated from Figma stays. */
  name?: string;
  /** What the property does, in plain words, for the docs and the props table. */
  description?: string;
  /** "internal": a Figma construction property (a layout helper, a hand-off toggle), not part of the component's API.
   * It keeps its Figma default, and is left out of the controls and the props table. */
  role?: 'api' | 'internal';
  /** Code names for a variant property's values: Figma value -> code value ("Danger primary" -> "danger"). */
  values?: Record<string, string>;
  /** Overrides the set's status for this property. */
  status?: DecisionStatus;
  /** A change an AI proposed after this property was accepted. The accepted fields stay in force until a person
   * accepts the revision. */
  revision?: { name?: string; description?: string; confidence?: number; evidence?: string[] };
  confidence?: number;
  /** What in the source supports the decision (Figma names, layers, docs text). */
  evidence?: string[];
}

/** One sentence of usage guidance and the evidence it rests on (ids into UsageDecision.sources). */
export interface UsageSentence {
  text: string;
  sources: string[];
}

/** Usage guidance for a component (the write-usage skill drafts it; a person accepts it). Every sentence cites
 * sources; the cited text is kept here so the pull request shows what each sentence rests on. */
export interface UsageDecision {
  status: DecisionStatus;
  by?: string;
  confidence?: number;
  /** Hash of the Figma set the guidance was written for. */
  setHash?: string;
  whenToUse?: UsageSentence[];
  whenNotToUse?: UsageSentence[];
  /** Guidance for values of the main variant property ("Use Ghost for ..."). */
  variants?: (UsageSentence & { property: string; value: string })[];
  /** Guidance on labels and copy. */
  content?: UsageSentence[];
  sources: Record<string, { kind: string; text: string }>;
  questions?: string[];
}

export const USAGE_SECTIONS = ['whenToUse', 'whenNotToUse', 'variants', 'content'] as const;

/** Behaviour templates a decision can choose for a component set (when structure and names cannot tell). */
export const ARCHETYPES = ['generic', 'button', 'link', 'checkbox', 'switch', 'disclosure', 'combobox'] as const;
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
  /** Usage guidance (when to use, when not, per variant, content), with its own review status. */
  usage?: UsageDecision;
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
// DOM, React and Lit names, and JavaScript reserved words (a prop named "function" is not valid code).
const RESERVED = new Set(['children', 'className', 'style', 'key', 'ref', 'id', 'disabled', 'class', 'slot', 'part', ...JS_RESERVED]);

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
    if (d.usage) {
      const u = d.usage;
      if (!['proposed', 'accepted', 'rejected'].includes(u.status)) err(setName, 'usage.status must be proposed, accepted or rejected.');
      for (const key of USAGE_SECTIONS) {
        for (const [i, x] of ((u[key] ?? []) as UsageSentence[]).entries()) {
          const where = `usage.${key}[${i}]`;
          if (!x.text?.trim()) err(setName, `${where}: empty sentence.`);
          if (!x.sources?.length) err(setName, `${where}: cites no source.`);
          for (const id of x.sources ?? []) if (!u.sources?.[id]) err(setName, `${where}: cites "${id}", which is not in usage.sources.`);
          if (key === 'variants') {
            const v = x as UsageSentence & { property: string; value: string };
            const fp = sets?.flatMap((st) => st.properties).find((p) => p.name === v.property);
            if (ir && (!fp || !(fp.options ?? []).includes(v.value))) err(setName, `${where}: "${v.property}=${v.value}" is not a Figma value of this set.`);
          }
        }
      }
      if (sets && u.setHash && !sets.some((st) => st.hash === u.setHash)) warn(setName, 'Figma changed this set since the usage guidance was written: check it is still right.');
    }
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
      if (pd.role !== undefined && pd.role !== 'api' && pd.role !== 'internal') err(setName, 'role must be "api" or "internal".', prop);
      if (pd.values !== undefined) {
        const fp = sets?.flatMap((s) => s.properties).find((x) => x.name === prop);
        if (fp && fp.type !== 'VARIANT') err(setName, 'values apply to variant properties only.', prop);
        for (const [fv, cv] of Object.entries(pd.values)) {
          if (fp?.options && !fp.options.includes(fv)) err(setName, `"${fv}" is not a value of this Figma property.`, prop);
          if (typeof cv !== 'string' || !/^[A-Za-z0-9][\w.-]*$/.test(cv)) err(setName, `"${cv}" is not a usable code value (letters, digits, - _ .).`, prop);
        }
        const vs = Object.values(pd.values);
        if (new Set(vs).size !== vs.length) err(setName, 'Two Figma values have the same code value.', prop);
      }
      const rn = pd.revision?.name;
      if (rn !== undefined && (!IDENT.test(rn) || RESERVED.has(rn))) err(setName, `Revision "${rn}" is not a usable camelCase name.`, prop);
    }
    // Once revisions are accepted, names must still be unique.
    const finalNames = Object.entries(d.props ?? {}).map(([prop, pd]) => ({ prop, name: pd.revision?.name ?? pd.name, revised: Boolean(pd.revision?.name) }));
    for (const x of finalNames.filter((f) => f.revised)) {
      const other = finalNames.find((f) => f.prop !== x.prop && f.name === x.name);
      if (other) err(setName, `Revision "${x.name}" is also the name for "${other.prop}".`, x.prop);
    }
  }
  return out;
}

/** What the generator applies for each set: accepted entries, or also proposed ones when previewing. */
export interface ActiveDecision {
  archetype?: Archetype;
  description?: string;
  usage?: UsageDecision;
  props: Map<string, { name?: string; description?: string; role?: 'api' | 'internal'; values?: Record<string, string> }>;
  status: DecisionStatus;
}

let ACTIVE = new Map<string, ActiveDecision>();

export function activeDecisions(file: DecisionsFile | undefined, level: ApplyLevel): Map<string, ActiveDecision> {
  const out = new Map<string, ActiveDecision>();
  if (!file || level === 'none') return out;
  const ok = (s: DecisionStatus | undefined) => s === 'accepted' || (level === 'proposed' && s === 'proposed');
  for (const [setName, d] of Object.entries(file.sets)) {
    const props = new Map<string, { name?: string; description?: string; role?: 'api' | 'internal'; values?: Record<string, string> }>();
    for (const [prop, pd] of Object.entries(d.props ?? {})) {
      // Previewing proposals shows pending revisions too.
      const rev = level === 'proposed' ? pd.revision : undefined;
      const base = ok(pd.status ?? d.status);
      const name = rev?.name ?? (base ? pd.name : undefined);
      const description = (base ? pd.description : undefined) ?? rev?.description;
      const role = base ? pd.role : undefined;
      const values = base ? pd.values : undefined;
      if (!name && !description && !role && !values) continue;
      props.set(prop, { ...(name ? { name } : {}), ...(description ? { description } : {}), ...(role ? { role } : {}), ...(values ? { values } : {}) });
    }
    const description = ok(d.status) ? d.description : undefined;
    const archetype = ok(d.status) ? d.archetype : undefined;
    const usage = d.usage && ok(d.usage.status) ? d.usage : undefined;
    if (props.size || description || archetype || usage) out.set(setName, { ...(archetype ? { archetype } : {}), ...(description ? { description } : {}), ...(usage ? { usage } : {}), props, status: d.status });
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

/** A Figma property decided to be internal (not API): hidden from controls and the props table. */
export function decidedInternal(set: Pick<IRComponentSet, 'name'>, figmaProp: string): boolean {
  return ACTIVE.get(set.name)?.props.get(figmaProp)?.role === 'internal';
}

/** Code value decided for one value of a Figma variant property, if any. */
export function decidedValue(set: Pick<IRComponentSet, 'name'>, figmaProp: string, figmaValue: string): string | undefined {
  return ACTIVE.get(set.name)?.props.get(figmaProp)?.values?.[figmaValue];
}

/** Description decided for a Figma property of a set, if any. */
export function decidedDescription(set: Pick<IRComponentSet, 'name'>, figmaProp: string): string | undefined {
  return ACTIVE.get(set.name)?.props.get(figmaProp)?.description;
}

/** Usage guidance for a set, when accepted (or proposed, when previewing proposals). */
export function decidedUsage(set: Pick<IRComponentSet, 'name'>): UsageDecision | undefined {
  return ACTIVE.get(set.name)?.usage;
}

export function decidedSetDescription(set: Pick<IRComponentSet, 'name'>): string | undefined {
  return ACTIVE.get(set.name)?.description;
}

/** Merges one AI proposal into the file. A proposed set is replaced. An accepted set is never overwritten: a name
 * or description that differs from what was accepted is added as a revision of that property, for a person to
 * accept. A rejected set is kept as it is. */
export function mergeProposal(file: DecisionsFile, setName: string, proposal: SetDecision): 'added' | 'updated' | 'revised' | 'kept' {
  const current = file.sets[setName];
  if (!current) { file.sets[setName] = { ...proposal, status: 'proposed' }; return 'added'; }
  // Usage guidance has its own status and its own skill: a new interpretation keeps it.
  if (current.status === 'proposed') { file.sets[setName] = { ...proposal, ...(current.usage ? { usage: current.usage } : {}), status: 'proposed' }; return 'updated'; }
  if (current.status === 'rejected') return 'kept';
  let revised = false;
  for (const [figma, pd] of Object.entries(proposal.props ?? {})) {
    const cur = current.props?.[figma];
    if ((cur?.status ?? current.status) === 'rejected') continue;
    const name = pd.name && pd.name !== cur?.name ? pd.name : undefined;
    // Accepted wording stays: only a missing description is proposed.
    const description = pd.description && !cur?.description ? pd.description : undefined;
    if (!name && !description) { if (cur?.revision) { delete cur.revision; } continue; }
    current.props = { ...current.props, [figma]: { ...cur, revision: { ...(name ? { name } : {}), ...(description ? { description } : {}), ...(pd.confidence !== undefined ? { confidence: pd.confidence } : {}), evidence: pd.evidence ?? [] } } };
    revised = true;
  }
  if (revised && proposal.setHash) current.setHash = proposal.setHash;
  return revised ? 'revised' : 'kept';
}

/** Sets with something waiting for a person: a proposed set, or revisions of properties in an accepted set. */
export function hasProposals(d: SetDecision): boolean {
  return d.status === 'proposed' || Object.values(d.props ?? {}).some((p) => p.revision) || d.usage?.status === 'proposed';
}

/** Accepts or rejects a set's proposals: the set itself when proposed, otherwise the revisions in it. */
export function decide(d: SetDecision, action: 'accept' | 'reject'): void {
  if (d.status === 'proposed') d.status = action === 'accept' ? 'accepted' : 'rejected';
  if (d.usage?.status === 'proposed') d.usage.status = action === 'accept' ? 'accepted' : 'rejected';
  for (const p of Object.values(d.props ?? {})) {
    if (!p.revision) continue;
    if (action === 'accept') {
      if (p.revision.name) p.name = p.revision.name;
      if (p.revision.description) p.description = p.revision.description;
      if (p.revision.confidence !== undefined) p.confidence = p.revision.confidence;
      if (p.revision.evidence?.length) p.evidence = p.revision.evidence;
    }
    delete p.revision;
  }
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
