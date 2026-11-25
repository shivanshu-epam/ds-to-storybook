// Usage guidance (docs/DOCS-ENGINE.md, roadmap phase 5: the write skill). ds-sync gathers each component's evidence
// into numbered sources; the write-usage skill drafts guidance in which every sentence cites them; the engine keeps
// only sentences whose citations exist and merges them into ds-sync.decisions.json as a proposal for a person.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CodeMapEntry } from '../code/map.ts';
import type { ApiProp } from '../code/api.ts';
import { emptyDecisions, loadDecisions, validateDecisions, type DecisionsFile, type UsageDecision, type UsageSentence } from '../decisions/decisions.ts';
import type { Reference } from '../docspec/types.ts';
import type { FigmaIR, IRComponentSet } from '../ir/types.ts';
import { spawnClaude, PLUGIN_DIR, type ClaudeRunner } from './interpret.ts';

export type UsageSourceKind = 'figma-description' | 'figma-doc' | 'figma-property' | 'reference' | 'code' | 'system';

export interface UsageSource {
  id: string;
  kind: UsageSourceKind;
  text: string;
}

/** One component's evidence for its usage guidance (.ds-sync/usage/<Component>.json). */
export interface UsageEvidence {
  component: string;
  title: string;
  /** Figma set the guidance belongs to (decisions are keyed by it). */
  set: string;
  setHash: string;
  kind: { id: string; title: string };
  /** The main variant property and its values: "variants" guidance is written for these. */
  primary?: { property: string; values: string[] };
  sources: UsageSource[];
  /** Usage already accepted for this set (re-runs propose only what they would change). */
  accepted?: UsageDecision;
}

/** The skill's answer (schemas/usage.schema.json). */
export interface UsageProposal {
  confidence: number;
  whenToUse?: UsageSentence[];
  whenNotToUse?: UsageSentence[];
  variants?: (UsageSentence & { value: string })[];
  content?: UsageSentence[];
  questions?: string[];
}

const PRIMARY = ['kind', 'variant', 'style', 'type', 'appearance', 'emphasis', 'intent', 'color', 'hierarchy', 'status', 'severity'];
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface UsageEvidenceInput {
  name: string;
  title: string;
  sets: IRComponentSet[];
  ref: Reference;
  /** Other components of the same kind in this system. */
  siblings: string[];
  /** Plain-language property descriptions (decisions), keyed by Figma property. */
  descriptions?: Record<string, string>;
  code?: { entry: CodeMapEntry; props: ApiProp[]; from: string };
  accepted?: UsageDecision;
  /** Figma properties decided internal (not API): left out. */
  internal?: Set<string>;
}

export function usageEvidence(x: UsageEvidenceInput): UsageEvidence {
  const main = x.sets[0]!;
  const sources: UsageSource[] = [];
  const add = (prefix: string, kind: UsageSourceKind, text: string) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length < 3 || sources.some((s) => s.text === t)) return;
    sources.push({ id: `${prefix}${sources.filter((s) => s.id.startsWith(prefix)).length + 1}`, kind, text: clip(t, 500) });
  };
  for (const s of x.sets) if (s.description.trim()) add('F', 'figma-description', `${s.name}: ${s.description}`);
  // The design team's own documentation frames, block by block.
  for (const s of x.sets) for (const f of s.docFrames) for (const b of f.blocks) if (b.text.trim().length >= 15) add('D', 'figma-doc', `${f.name}: ${b.text}`);
  for (const s of x.sets) {
    for (const p of s.properties) {
      if (x.internal?.has(p.name)) continue;
      const values = p.type === 'VARIANT' ? `: ${(p.options ?? []).join(', ')}` : p.type === 'TEXT' ? ` (text, default "${clip(String(p.default), 60)}")` : p.type === 'BOOLEAN' ? ` (on/off, default ${String(p.default) === 'true' ? 'on' : 'off'})` : ' (swappable content)';
      add('P', 'figma-property', `${p.name}${values}${x.descriptions?.[p.name] ? `. ${x.descriptions[p.name]}` : ''}`);
    }
  }
  for (const t of x.ref.guidance?.whenToUse ?? []) add('R', 'reference', `${x.ref.title} guidance: ${t}`);
  for (const t of x.ref.guidance?.whenNotToUse ?? []) add('R', 'reference', `${x.ref.title} guidance: ${t}`);
  add('R', 'reference', `${x.ref.title} accessibility: ${x.ref.accessibility.pattern}; role ${x.ref.accessibility.role}. ${x.ref.accessibility.name}${(x.ref.accessibility.keyboard ?? []).map((k) => ` ${k.key}: ${k.action}.`).join('')}`);
  if (x.code) {
    const byName = new Map(x.code.props.map((p) => [p.name, p]));
    for (const m of x.code.entry.mappings) {
      const p = m.code ? byName.get(m.code) : undefined;
      if (p?.description) add('C', 'code', `${x.code.from} ${x.code.entry.export}.${p.name} (Figma ${m.figma}): ${p.description}`);
    }
    for (const n of x.code.entry.codeOnly) { const p = byName.get(n); if (p?.description) add('C', 'code', `${x.code.from} ${x.code.entry.export}.${n} (code only): ${p.description}`); }
  }
  if (x.siblings.length) add('S', 'system', `Other ${x.ref.title.toLowerCase()} components in this design system: ${x.siblings.join(', ')}.`);
  const primaryProp = PRIMARY.map((n) => main.properties.find((p) => p.type === 'VARIANT' && p.name.trim().toLowerCase() === n && (p.options?.length ?? 0) > 1)).find(Boolean);
  return {
    component: x.name, title: x.title, set: main.name, setHash: main.hash, kind: { id: x.ref.id, title: x.ref.title },
    ...(primaryProp ? { primary: { property: primaryProp.name, values: primaryProp.options ?? [] } } : {}),
    sources,
    ...(x.accepted ? { accepted: x.accepted } : {}),
  };
}

/** Keeps the sentences whose citations are all real sources (and, for variants, whose value is real); records the
 * cited text with them. What is dropped is reported. */
export function toUsageDecision(ev: UsageEvidence, p: UsageProposal, by: string): { usage: UsageDecision; dropped: string[] } {
  const byId = new Map(ev.sources.map((s) => [s.id, s]));
  const dropped: string[] = [];
  const cited = new Set<string>();
  const keep = <T extends UsageSentence>(section: string, list: T[] | undefined, extra?: (x: T) => string | undefined): T[] => (list ?? []).flatMap((x) => {
    const text = x.text?.replace(/\s+/g, ' ').trim();
    const bad = !text ? 'empty' : !x.sources?.length ? 'cites no source' : x.sources.find((id) => !byId.has(id)) ? `cites unknown source ${x.sources.find((id) => !byId.has(id))}` : extra?.(x);
    if (bad) { dropped.push(`${section}: "${clip(text ?? '', 60)}" (${bad})`); return []; }
    for (const id of x.sources) cited.add(id);
    return [{ ...x, text: text!, sources: [...new Set(x.sources)] }];
  });
  const whenToUse = keep('whenToUse', p.whenToUse);
  const whenNotToUse = keep('whenNotToUse', p.whenNotToUse);
  const variants = keep('variants', p.variants, (x) => (ev.primary?.values.includes(x.value) ? undefined : `"${x.value}" is not a value of ${ev.primary?.property ?? 'the main property'}`)).map((x) => ({ property: ev.primary!.property, value: x.value, text: x.text, sources: x.sources }));
  const content = keep('content', p.content);
  const usage: UsageDecision = {
    status: 'proposed', by, confidence: p.confidence, setHash: ev.setHash,
    ...(whenToUse.length ? { whenToUse } : {}),
    ...(whenNotToUse.length ? { whenNotToUse } : {}),
    ...(variants.length ? { variants } : {}),
    ...(content.length ? { content } : {}),
    sources: Object.fromEntries([...cited].sort().map((id) => [id, { kind: byId.get(id)!.kind, text: byId.get(id)!.text }])),
    ...(p.questions?.length ? { questions: p.questions } : {}),
  };
  return { usage, dropped };
}

/** Merges a usage proposal: an accepted or rejected usage stays (re-run with a person's review to change it). */
export function mergeUsage(file: DecisionsFile, set: string, usage: UsageDecision): 'added' | 'updated' | 'kept' {
  const cur = file.sets[set];
  if (!cur) { file.sets[set] = { status: 'proposed', usage }; return 'added'; }
  if (cur.usage && cur.usage.status !== 'proposed') return 'kept';
  const had = Boolean(cur.usage);
  cur.usage = usage;
  return had ? 'updated' : 'added';
}

export const USAGE_SCHEMA = join(PLUGIN_DIR, '..', 'schemas', 'usage.schema.json');

export function usageArgs(file: string, o: { model?: string; budget?: number; extraArgs?: string[] }): string[] {
  const { $schema: _s, $id: _i, ...schema } = JSON.parse(readFileSync(USAGE_SCHEMA, 'utf8')) as Record<string, unknown>;
  return [
    '-p', `/ds-sync:write-usage ${file}`,
    '--plugin-dir', PLUGIN_DIR,
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    // The evidence file is all the skill reads: no shell, no edits, no network.
    '--allowedTools', 'Read',
    '--permission-mode', 'dontAsk',
    '--max-turns', '6',
    ...(o.model ? ['--model', o.model] : []),
    ...(o.budget ? ['--max-budget-usd', String(o.budget)] : []),
    ...(o.extraArgs ?? []),
  ];
}

export interface UsageRunOptions {
  dir: string;
  decisionsPath: string;
  ir?: FigmaIR;
  only?: string[];
  /** Also redo components whose usage is already proposed. */
  all?: boolean;
  concurrency?: number;
  model?: string;
  budget?: number;
  extraArgs?: string[];
  cwd: string;
  log: (m: string) => void;
  runner?: ClaudeRunner;
}

export async function writeUsage(o: UsageRunOptions): Promise<{ done: string[]; failed: { component: string; reason: string }[]; costUsd: number }> {
  if (!existsSync(o.dir)) throw new Error(`No usage evidence in ${o.dir}: run "ds-sync generate" first.`);
  const file: DecisionsFile = loadDecisions(o.decisionsPath) ?? emptyDecisions();
  const items = readdirSync(o.dir).filter((f) => f.endsWith('.json')).map((f) => ({ path: join(o.dir, f), ev: JSON.parse(readFileSync(join(o.dir, f), 'utf8')) as UsageEvidence }));
  const todo = items.filter(({ ev }) => (o.only ? o.only.includes(ev.component) : o.all || !file.sets[ev.set]?.usage));
  const run = o.runner ?? spawnClaude;
  const by = `ai:${o.model ?? 'claude'}`;
  const done: string[] = [];
  const failed: { component: string; reason: string }[] = [];
  let costUsd = 0;
  o.log(`Usage: ${todo.length} component(s), ${o.concurrency ?? 4} at a time`);
  const queue = [...todo];
  const worker = async () => {
    for (let x = queue.shift(); x; x = queue.shift()) {
      const res = await run(usageArgs(x.path, o), o.cwd);
      let out: { structured_output?: UsageProposal; total_cost_usd?: number; result?: string } | undefined;
      try { out = JSON.parse(res.stdout) as typeof out; } catch { /* reported below */ }
      costUsd += out?.total_cost_usd ?? 0;
      if (res.code !== 0 || !out?.structured_output) {
        failed.push({ component: x.ev.component, reason: (out?.result ?? res.stderr ?? `exit ${res.code}`).slice(0, 300) });
        o.log(`Usage: ${x.ev.component}: failed (${failed.at(-1)!.reason.split('\n')[0]})`);
        continue;
      }
      const { usage, dropped } = toUsageDecision(x.ev, out.structured_output, by);
      for (const d of dropped) o.log(`Usage: ${x.ev.component}: dropped ${d}`);
      done.push(x.ev.component);
      o.log(`Usage: ${x.ev.component}: ${mergeUsage(file, x.ev.set, usage)}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 4) }, worker));
  // The file stays valid: a usage proposal that fails validation is removed, not written.
  for (const p of validateDecisions(file, o.ir).filter((p) => p.severity === 'error' && /^usage/.test(p.message))) {
    const d = file.sets[p.set];
    if (d?.usage?.status === 'proposed') { delete d.usage; o.log(`Usage: removed invalid proposal ${p.set}: ${p.message}`); }
  }
  if (done.length) writeFileSync(o.decisionsPath, JSON.stringify({ ...file, sets: Object.fromEntries(Object.entries(file.sets).sort(([a], [b]) => a.localeCompare(b))) }, null, 2) + '\n');
  return { done, failed, costUsd };
}
