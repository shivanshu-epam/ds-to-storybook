import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { claudeArgs, interpret, PLUGIN_DIR, toDecisions, type ClaudeRunner } from '../src/ai/interpret.ts';
import { activeDecisions, setActiveDecisions, validateDecisions, type DecisionsFile } from '../src/decisions/decisions.ts';
import { referenceProps } from '../src/eval/eval.ts';
import type { FigmaNode } from '../src/figma/types.ts';
import { genericTemplate, propPlan } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { buildComponentSet } from '../src/ir/build.ts';
import type { FigmaIR } from '../src/ir/types.ts';
import { buildReview, writeReview } from '../src/review/review.ts';
import type { Discovery } from '../src/discover/discover.ts';

const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
// A checkbox as a designer names it: a misspelled True/False axis, a sentence-like boolean, a label text.
const node: FigmaNode = {
  id: 'C:1', name: 'Checkbox', type: 'COMPONENT_SET',
  componentPropertyDefinitions: {
    isIntermediate: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] },
    'Show Help Text#1:0': { type: 'BOOLEAN', defaultValue: false },
    'label#2:0': { type: 'TEXT', defaultValue: 'Accept' },
  },
  children: ['False', 'True'].map((v, i) => ({
    id: `C:${i + 2}`, name: `isIntermediate=${v}`, type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(120, 20),
    children: [
      { id: `C:${i + 2}t`, name: 'Label', type: 'TEXT', characters: 'Accept', componentPropertyReferences: { characters: 'label#2:0' }, absoluteBoundingBox: box(80, 20) },
      { id: `C:${i + 2}h`, name: 'Help', type: 'TEXT', characters: 'Help', componentPropertyReferences: { visible: 'Show Help Text#1:0' }, absoluteBoundingBox: box(80, 20) },
    ],
  })),
};
const set = buildComponentSet({ target: { id: 'C:1', archetype: 'generic', figma: { page: 'p', componentSet: { id: 'C:1', name: 'Checkbox' } } }, set: node, docFrames: [], componentNames: {}, resolve: () => undefined });
const ir = { irVersion: 1, fileKey: 'F', fileName: 'f', version: '1', lastModified: '', variables: { source: 'none', byId: {}, byName: {} }, components: [set], missing: [] } as FigmaIR;
const discovery = { proposals: [{ name: 'Checkbox', template: 'generic', sets: { main: 'C:1' }, page: 'p', docFrames: [], confidence: 0.6, reason: '' }] } as unknown as Discovery;
const decisions = (status: 'proposed' | 'accepted'): DecisionsFile => ({
  version: 1,
  sets: { Checkbox: { status, by: 'ai:test', props: { isIntermediate: { name: 'isIndeterminate', description: 'Shows the mixed state.' }, 'Show Help Text': { name: 'hasHelpText' } } } },
});

afterEach(() => setActiveDecisions(new Map()));

describe('decisions (hybrid phase 1)', () => {
  it('validates names and Figma references, and reports stale entries', () => {
    expect(validateDecisions(decisions('accepted'), ir)).toEqual([]);
    const bad: DecisionsFile = { version: 1, sets: { Checkbox: { status: 'proposed', setHash: 'old', props: { Nope: { name: 'x' }, label: { name: 'Bad Name' }, isIntermediate: { name: 'children' } } }, Gone: { status: 'accepted' } } };
    const msgs = validateDecisions(bad, ir).map((p) => `${p.severity} ${p.set} ${p.prop ?? ''} ${p.message}`);
    expect(msgs.some((m) => /error Checkbox Nope Not a property/.test(m))).toBe(true);
    expect(msgs.some((m) => /error Checkbox label .*not a camelCase/.test(m))).toBe(true);
    expect(msgs.some((m) => /error Checkbox isIntermediate .*reserved/.test(m))).toBe(true);
    expect(msgs.some((m) => /error Gone .*No Figma component set/.test(m))).toBe(true);
    expect(msgs.some((m) => /warning Checkbox .*Figma changed/.test(m))).toBe(true);
  });

  it('applies accepted decisions only, unless previewing proposals', () => {
    expect(activeDecisions(decisions('proposed'), 'accepted').size).toBe(0);
    expect(activeDecisions(decisions('proposed'), 'proposed').size).toBe(1);
    expect(activeDecisions(decisions('accepted'), 'none').size).toBe(0);
  });

  it('renames props and adds descriptions in the generated component, stories and docs', () => {
    const before = propPlan(set);
    expect(before.axes[0]!.prop).toBe('isIntermediate');
    setActiveDecisions(activeDecisions(decisions('accepted'), 'accepted'));
    const after = propPlan(set);
    expect(after.axes[0]!.prop).toBe('isIndeterminate');
    expect(after.booleans[0]!.prop).toBe('hasHelpText');
    const r = genericTemplate({ fileKey: 'F', version: '1', sets: { main: set }, resolver: new TokenResolver(loadTokens({ variables: {} })), icons: new Map() }, 'Checkbox', { title: 'Checkbox', instance: () => undefined });
    const tsx = r.files.find((f) => f.path.endsWith('Checkbox.tsx'))!.content;
    const stories = r.files.find((f) => /\.stories\.tsx$/.test(f.path))!.content;
    expect(tsx).toContain('isIndeterminate?: boolean;');
    expect(tsx).toContain('Shows the mixed state. Figma: isIntermediate.');
    expect(tsx).not.toMatch(/\bisIntermediate\?:/);
    expect(stories).toContain('Shows the mixed state. Figma: isIntermediate');
    // The data attribute keeps the Figma name, so the CSS selectors do not change.
    expect(tsx).toMatch(/data-is-intermediate/);
  });

  it('writes review evidence with hints, and marks components decided only for the current Figma content', () => {
    const [item] = buildReview(ir, discovery);
    expect(item!.sets[0]!.properties.map((p) => [p.figma, p.generatedName, p.generatedAs])).toEqual([
      ['isIntermediate', 'isIntermediate', 'variant'], ['Show Help Text', 'showHelpText', 'boolean'], ['label', 'label', 'text'],
    ]);
    expect(item!.sets[0]!.layers.find((l) => l.path === 'Help')?.boundTo).toEqual(['Show Help Text']);
    expect(item!.hints.join('\n')).toMatch(/no description/);
    const dir = mkdtempSync(join(tmpdir(), 'ds-review-'));
    expect(writeReview(dir, [item!], undefined)[0]!.decided).toBe(false);
    expect(writeReview(dir, [item!], { version: 1, sets: { Checkbox: { status: 'proposed', setHash: set.hash } } })[0]!.decided).toBe(true);
    expect(writeReview(dir, [item!], { version: 1, sets: { Checkbox: { status: 'proposed', setHash: 'stale' } } })[0]!.decided).toBe(false);
  });

  it('keeps only what is in the evidence from an AI answer', () => {
    const [item] = buildReview(ir, discovery);
    const { decisions: d, dropped } = toDecisions(item!, {
      sets: [
        { set: 'Checkbox', confidence: 0.8, evidence: ['axis isIntermediate'], description: 'A checkbox.', props: [
          { figma: 'isIntermediate', name: 'isIndeterminate', confidence: 0.9, evidence: ['options False/True'] },
          { figma: 'label', name: 'label', confidence: 0.9, evidence: [] },
          { figma: 'Invented', name: 'size', confidence: 0.9, evidence: [] },
        ] },
        { set: 'Other', confidence: 1, evidence: [] },
      ],
    }, 'ai:test');
    expect(Object.keys(d.Checkbox!.props!)).toEqual(['isIntermediate']);
    expect(d.Checkbox).toMatchObject({ status: 'proposed', setHash: set.hash, description: 'A checkbox.' });
    expect(dropped).toEqual(['Checkbox › "Invented" is not a Figma property', 'set "Other" is not in the review file']);
  });

  it('runs Claude headless with the plugin, a schema and read-only tools, and never overwrites accepted entries', async () => {
    const args = claudeArgs('/x/Checkbox.json', { model: 'claude-opus-5-5', budget: 0.5 });
    expect(args.slice(0, 4)).toEqual(['-p', '/ds-sync:interpret-component /x/Checkbox.json', '--plugin-dir', PLUGIN_DIR]);
    const schema = JSON.parse(args[args.indexOf('--json-schema') + 1]!) as Record<string, unknown>;
    expect(schema.$schema).toBeUndefined();
    expect(args).toEqual(expect.arrayContaining(['--allowedTools', 'Read', '--permission-mode', 'dontAsk', '--model', 'claude-opus-5-5', '--max-budget-usd', '0.5']));

    const dir = mkdtempSync(join(tmpdir(), 'ds-interpret-'));
    writeReview(dir, buildReview(ir, discovery), undefined);
    const decisionsPath = join(dir, 'ds-sync.decisions.json');
    const answer = { sets: [{ set: 'Checkbox', confidence: 0.9, evidence: ['e'], props: [{ figma: 'isIntermediate', name: 'isIndeterminate', confidence: 0.9, evidence: ['e'] }] }] };
    const runner: ClaudeRunner = async () => ({ code: 0, stdout: JSON.stringify({ structured_output: answer, total_cost_usd: 0.02 }), stderr: '' });
    const res = await interpret({ reviewDir: join(dir, 'review'), decisionsPath, ir, cwd: dir, log: () => {}, runner, includeBuildingBlocks: true });
    expect(res).toMatchObject({ done: ['Checkbox'], failed: [] });
    const saved = JSON.parse(readFileSync(decisionsPath, 'utf8')) as DecisionsFile;
    expect(saved.sets.Checkbox).toMatchObject({ status: 'proposed', by: 'ai:claude', props: { isIntermediate: { name: 'isIndeterminate' } } });

    saved.sets.Checkbox!.status = 'accepted';
    saved.sets.Checkbox!.props!.isIntermediate!.name = 'isMixed';
    writeFileSync(decisionsPath, JSON.stringify(saved));
    await interpret({ reviewDir: join(dir, 'review'), decisionsPath, ir, cwd: dir, log: () => {}, runner, only: ['Checkbox'] });
    expect((JSON.parse(readFileSync(decisionsPath, 'utf8')) as DecisionsFile).sets.Checkbox!.props!.isIntermediate!.name).toBe('isMixed');

    const failing: ClaudeRunner = async () => ({ code: 1, stdout: JSON.stringify({ is_error: true, result: 'Not logged in' }), stderr: '' });
    const f = await interpret({ reviewDir: join(dir, 'review'), decisionsPath, ir, cwd: dir, log: () => {}, runner: failing, only: ['Checkbox'] });
    expect(f.failed).toEqual([{ component: 'Checkbox', reason: 'Not logged in' }]);
  });

  it('reads reference props from the syntax, following local types', () => {
    const root = mkdtempSync(join(tmpdir(), 'ds-ref-'));
    mkdirSync(join(root, 'Badge'));
    writeFileSync(join(root, 'Badge', 'types.ts'), `import type { StyledPropsBlade } from '~components/Box';
type Common = { size?: 'small' | 'large'; icon?: unknown };
type BadgeProps = Common & { color?: string; testID?: string } & StyledPropsBlade;
export type { BadgeProps };`);
    writeFileSync(join(root, 'Badge', 'Badge.stories.tsx'), 'type BadgeProps = { story: string };');
    expect(referenceProps(root, 'Badge')?.sort()).toEqual(['color', 'icon', 'size', 'testID']);
    expect(referenceProps(root, 'Missing')).toBeNull();
  });

  it('plugin hook validates the decisions file after an edit, and ignores other files', () => {
    const hook = join(PLUGIN_DIR, 'hooks', 'validate-decisions.mjs');
    const run = (file: string) => spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } }), encoding: 'utf8' });
    expect(run('/tmp/other.json').status).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), 'ds-hook-'));
    writeFileSync(join(dir, 'ds-sync.decisions.json'), JSON.stringify({ version: 2, sets: {} }));
    writeFileSync(join(dir, 'ds-sync.config.json'), JSON.stringify({ figma: { fileKey: 'F' } }));
    const r = run(join(dir, 'ds-sync.decisions.json'));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/version must be 1/);
  });
});
