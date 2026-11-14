// Runs the interpret-component skill headless (claude -p) on each open review file, in parallel, and merges the
// schema-checked answers into ds-sync.decisions.json as proposals. AI is optional: nothing else needs this file.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emptyDecisions, loadDecisions, mergeProposal, validateDecisions, type DecisionsFile, type PropDecision, type SetDecision } from '../decisions/decisions.ts';
import type { FigmaIR } from '../ir/types.ts';
import type { ReviewIndexEntry, ReviewItem } from '../review/review.ts';

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PLUGIN_DIR = join(ENGINE, 'claude-plugin');
export const PROPOSAL_SCHEMA = join(ENGINE, 'schemas', 'proposal.schema.json');

export interface Proposal {
  sets: { set: string; archetype?: SetDecision['archetype']; description?: string; confidence: number; evidence: string[]; questions?: string[]; props?: ({ figma: string } & PropDecision)[] }[];
}

/** Runs one Claude call; returns stdout. Injectable for tests. */
export type ClaudeRunner = (args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

export const spawnClaude: ClaudeRunner = (args, cwd) =>
  new Promise((done) => {
    const child = spawn(process.env.DS_SYNC_CLAUDE ?? 'claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => done({ code: 127, stdout, stderr: `${stderr}${e.message}` }));
    child.on('close', (code) => done({ code: code ?? 1, stdout, stderr }));
  });

export interface InterpretOptions {
  reviewDir: string;
  decisionsPath: string;
  ir?: FigmaIR;
  only?: string[];
  /** Also redo components that already have a current decision. */
  all?: boolean;
  includeBuildingBlocks?: boolean;
  concurrency?: number;
  model?: string;
  /** Per call, in USD (claude --max-budget-usd). */
  budget?: number;
  /** Extra claude arguments, e.g. ["--bare"] in CI with ANTHROPIC_API_KEY. */
  extraArgs?: string[];
  cwd: string;
  log: (m: string) => void;
  runner?: ClaudeRunner;
}

/** The proposal schema as Claude Code takes it: without the $schema and $id keywords. */
export function proposalSchema(): string {
  const { $schema: _s, $id: _i, ...schema } = JSON.parse(readFileSync(PROPOSAL_SCHEMA, 'utf8')) as Record<string, unknown>;
  return JSON.stringify(schema);
}

export function claudeArgs(reviewFile: string, o: Pick<InterpretOptions, 'model' | 'budget' | 'extraArgs'>): string[] {
  return [
    '-p', `/ds-sync:interpret-component ${reviewFile}`,
    '--plugin-dir', PLUGIN_DIR,
    '--output-format', 'json',
    '--json-schema', proposalSchema(),
    // Reading the evidence file is all the skill needs: no shell, no edits, no network.
    '--allowedTools', 'Read',
    '--permission-mode', 'dontAsk',
    '--max-turns', '8',
    ...(o.model ? ['--model', o.model] : []),
    ...(o.budget ? ['--max-budget-usd', String(o.budget)] : []),
    ...(o.extraArgs ?? []),
  ];
}

/** Turns one structured answer into decisions, dropping anything that is not in the evidence. */
export function toDecisions(item: ReviewItem, proposal: Proposal, by: string): { decisions: Record<string, SetDecision>; dropped: string[] } {
  const decisions: Record<string, SetDecision> = {};
  const dropped: string[] = [];
  for (const s of proposal.sets ?? []) {
    const set = item.sets.find((x) => x.name === s.set);
    if (!set) { dropped.push(`set "${s.set}" is not in the review file`); continue; }
    const known = new Set(set.properties.map((p) => p.figma));
    const props: Record<string, PropDecision> = {};
    for (const p of s.props ?? []) {
      if (!known.has(p.figma)) { dropped.push(`${s.set} › "${p.figma}" is not a Figma property`); continue; }
      const prop = set.properties.find((x) => x.figma === p.figma)!;
      // Instance swaps are not props yet, and state axes are CSS states: only their descriptions apply.
      const nameable = prop.generatedAs !== 'instance swap' && prop.generatedAs !== 'state';
      if (p.name && !nameable) dropped.push(`${s.set} › name for "${p.figma}" (${prop.generatedAs}, not a prop)`);
      const entry: PropDecision = {
        ...(p.name && nameable && p.name !== prop.generatedName ? { name: p.name } : {}),
        ...(p.description ? { description: p.description } : {}),
        confidence: p.confidence,
        evidence: p.evidence,
      };
      if (entry.name || entry.description) props[p.figma] = entry;
    }
    decisions[s.set] = {
      status: 'proposed', by, confidence: s.confidence, evidence: s.evidence, setHash: set.hash,
      ...(s.archetype ? { archetype: s.archetype } : {}),
      ...(s.description && !set.description.trim() ? { description: s.description } : {}),
      ...(s.questions?.length ? { questions: s.questions } : {}),
      ...(Object.keys(props).length ? { props } : {}),
    };
  }
  return { decisions, dropped };
}

export async function interpret(o: InterpretOptions): Promise<{ done: string[]; failed: { component: string; reason: string }[]; costUsd: number }> {
  const index = JSON.parse(readFileSync(join(o.reviewDir, 'index.json'), 'utf8')) as ReviewIndexEntry[];
  const todo = index.filter((x) => (o.only ? o.only.includes(x.component) : (o.all || !x.decided) && (o.includeBuildingBlocks || !x.buildingBlock)));
  const file: DecisionsFile = loadDecisions(o.decisionsPath) ?? emptyDecisions();
  const run = o.runner ?? spawnClaude;
  const by = `ai:${o.model ?? 'claude'}`;
  const done: string[] = [];
  const failed: { component: string; reason: string }[] = [];
  let costUsd = 0;
  o.log(`Interpret: ${todo.length} component(s), ${o.concurrency ?? 4} at a time`);
  const queue = [...todo];
  const worker = async () => {
    for (let x = queue.shift(); x; x = queue.shift()) {
      const item = JSON.parse(readFileSync(x.file, 'utf8')) as ReviewItem;
      const res = await run(claudeArgs(x.file, o), o.cwd);
      let out: { structured_output?: Proposal; total_cost_usd?: number; is_error?: boolean; result?: string } | undefined;
      try { out = JSON.parse(res.stdout) as typeof out; } catch { /* reported below */ }
      costUsd += out?.total_cost_usd ?? 0;
      if (res.code !== 0 || !out?.structured_output) {
        failed.push({ component: x.component, reason: (out?.result ?? res.stderr ?? `exit ${res.code}`).slice(0, 300) });
        o.log(`Interpret: ${x.component}: failed (${failed.at(-1)!.reason.split('\n')[0]})`);
        continue;
      }
      const { decisions, dropped } = toDecisions(item, out.structured_output, by);
      for (const d of dropped) o.log(`Interpret: ${x.component}: dropped ${d}`);
      const merged = Object.entries(decisions).map(([set, d]) => `${set}: ${mergeProposal(file, set, d)}`);
      done.push(x.component);
      o.log(`Interpret: ${x.component}: ${merged.join(', ')}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 4) }, worker));
  const problems = validateDecisions(file, o.ir).filter((p) => p.severity === 'error');
  for (const p of problems) {
    // A proposal that fails validation is removed, not written: the file stays valid.
    if (file.sets[p.set]?.status !== 'proposed') continue;
    if (p.prop) delete file.sets[p.set]!.props?.[p.prop];
    else delete file.sets[p.set];
    o.log(`Interpret: removed invalid proposal ${p.set}${p.prop ? ` › ${p.prop}` : ''}: ${p.message}`);
  }
  if (done.length) writeFileSync(o.decisionsPath, JSON.stringify(sortSets(file), null, 2) + '\n');
  return { done, failed, costUsd };
}

const sortSets = (f: DecisionsFile): DecisionsFile => ({ ...f, sets: Object.fromEntries(Object.entries(f.sets).sort(([a], [b]) => a.localeCompare(b))) });

export const claudeAvailable = async (runner: ClaudeRunner = spawnClaude) => (await runner(['--version'], process.cwd())).code === 0;
