import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { mergeUsage, toUsageDecision, usageEvidence, writeUsage, type UsageEvidence } from '../src/ai/usage.ts';
import { decide, validateDecisions, type DecisionsFile } from '../src/decisions/decisions.ts';
import { loadReferences } from '../src/docspec/build.ts';
import { usageSection } from '../src/generate/docs.ts';
import type { IRComponentSet } from '../src/ir/types.ts';

const button = loadReferences().find((r) => r.id === 'button')!;
const set: IRComponentSet = {
  targetId: 'B', nodeId: 'B:1', name: 'Button', description: 'Buttons start actions.', page: 'p', notes: [], hash: 'h1',
  docFrames: [{ nodeId: 'D:1', name: 'Usage', blocks: [{ nodeId: 'D:2', text: 'Use Ghost for actions in toolbars and tables.' }, { nodeId: 'D:3', text: 'ok' }] }],
  properties: [
    { name: 'Style', rawName: 'Style', type: 'VARIANT', default: 'Primary', options: ['Primary', 'Ghost'] },
    { name: 'Resizer', rawName: 'Resizer#1', type: 'BOOLEAN', default: false },
  ],
  variants: [],
};
const ev = usageEvidence({ name: 'Button', title: 'Components/Button', sets: [set], ref: button, siblings: ['IconButton'], internal: new Set(['Resizer']) });
const id = (text: RegExp) => ev.sources.find((s) => text.test(s.text))!.id;

describe('usage guidance: evidence', () => {
  it('numbers the sources by kind, from Figma, the reference guidance and the system', () => {
    expect(ev).toMatchObject({ component: 'Button', set: 'Button', setHash: 'h1', kind: { id: 'button' }, primary: { property: 'Style', values: ['Primary', 'Ghost'] } });
    expect(ev.sources.map((s) => s.id)).toEqual(['F1', 'D1', 'P1', 'R1', 'R2', 'R3', 'R4', 'R5', 'S1']);
    expect(ev.sources.find((s) => s.id === 'D1')!.text).toBe('Usage: Use Ghost for actions in toolbars and tables.');
    expect(ev.sources.some((s) => /Resizer/.test(s.text))).toBe(false);
    expect(ev.sources.find((s) => s.id === 'S1')!.text).toBe('Other button components in this design system: IconButton.');
  });
});

describe('usage guidance: checking and recording drafts', () => {
  const draft = {
    confidence: 0.7,
    whenToUse: [{ text: 'Use a button  to start an action.', sources: [id(/start an action/)] }, { text: 'Use it everywhere.', sources: [] }],
    whenNotToUse: [{ text: 'Do not use a button to navigate.', sources: ['Z1'] }],
    variants: [{ value: 'Ghost', text: 'Use for actions in toolbars and tables.', sources: ['D1'] }, { value: 'Purple', text: 'x', sources: ['P1'] }],
    questions: ['When is Primary used twice?'],
  };

  it('keeps only cited sentences on real values, with the cited text', () => {
    const { usage, dropped } = toUsageDecision(ev, draft, 'ai:test');
    expect(usage.whenToUse).toEqual([{ text: 'Use a button to start an action.', sources: ['R1'] }]);
    expect(usage.whenNotToUse).toBeUndefined();
    expect(usage.variants).toEqual([{ property: 'Style', value: 'Ghost', text: 'Use for actions in toolbars and tables.', sources: ['D1'] }]);
    expect(Object.keys(usage.sources)).toEqual(['D1', 'R1']);
    expect(usage).toMatchObject({ status: 'proposed', by: 'ai:test', setHash: 'h1', questions: ['When is Primary used twice?'] });
    expect(dropped).toEqual([
      'whenToUse: "Use it everywhere." (cites no source)',
      'whenNotToUse: "Do not use a button to navigate." (cites unknown source Z1)',
      'variants: "x" ("Purple" is not a value of Style)',
    ]);
  });

  it('merges as a proposal, keeps accepted guidance, and validates citations', () => {
    const file: DecisionsFile = { version: 1, sets: {} };
    const { usage } = toUsageDecision(ev, draft, 'ai:test');
    expect(mergeUsage(file, 'Button', usage)).toBe('added');
    expect(validateDecisions(file, { components: [set] } as never)).toEqual([]);
    decide(file.sets.Button!, 'accept');
    expect(file.sets.Button!.usage!.status).toBe('accepted');
    expect(mergeUsage(file, 'Button', usage)).toBe('kept');
    file.sets.Button!.usage!.whenToUse![0]!.sources = ['R9'];
    expect(validateDecisions(file).map((p) => p.message)).toEqual(['usage.whenToUse[0]: cites "R9", which is not in usage.sources.']);
  });

  it('renders the Usage section with each sentence and its source kinds', () => {
    const { usage } = toUsageDecision(ev, draft, 'ai:test');
    const md = usageSection(usage).join('\n');
    expect(md).toContain('## Usage');
    expect(md).toContain('Draft for review (ai:test)');
    expect(md).toContain('{"Use a button to start an action."}{" "}<small>{"(ds-sync guidance)"}</small>');
    expect(md).toContain('<strong>{"Ghost"}</strong>: {"Use for actions in toolbars and tables."}{" "}<small>{"(Figma docs)"}</small>');
    expect(usageSection({ ...usage, status: 'accepted' }).join('\n')).not.toContain('Draft for review');
  });

  it('runs the skill headless per component and records the checked answers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-'));
    mkdirSync(join(dir, 'usage'));
    writeFileSync(join(dir, 'usage', 'Button.json'), JSON.stringify(ev satisfies UsageEvidence));
    const calls: string[][] = [];
    const res = await writeUsage({
      dir: join(dir, 'usage'), decisionsPath: join(dir, 'ds-sync.decisions.json'), cwd: dir, log: () => {},
      runner: async (args) => { calls.push(args); return { code: 0, stdout: JSON.stringify({ structured_output: draft, total_cost_usd: 0.01 }), stderr: '' }; },
    });
    expect(res).toMatchObject({ done: ['Button'], failed: [] });
    expect(calls[0]!.slice(0, 2)).toEqual(['-p', `/ds-sync:write-usage ${join(dir, 'usage', 'Button.json')}`]);
    expect(calls[0]).toEqual(expect.arrayContaining(['--allowedTools', 'Read', '--json-schema']));
    const written = JSON.parse(readFileSync(join(dir, 'ds-sync.decisions.json'), 'utf8')) as DecisionsFile;
    expect(written.sets.Button!.usage!.whenToUse).toHaveLength(1);
  });
});
