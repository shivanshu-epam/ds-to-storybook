import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { auditMarkdown, testTallies, withTests } from '../src/audit/audit.ts';
import { buildScorecard, scorecardReport, type ScorecardInput } from '../src/generate/scorecard.ts';
import type { IRComponentSet } from '../src/ir/types.ts';

const set = (variants: number, options: number[]): IRComponentSet => ({
  targetId: 't', nodeId: '1:2', name: 'Tabs', description: '', page: 'p', docFrames: [], notes: [], hash: 'h',
  properties: options.map((n, i) => ({ name: `axis${i}`, rawName: `axis${i}`, type: 'VARIANT' as const, default: 'a', options: Array.from({ length: n }, (_, k) => `v${k}`) })),
  variants: Array.from({ length: variants }, (_, i) => ({ nodeId: `v${i}`, name: `v${i}`, values: {}, style: { fills: [], strokes: [] }, parts: [] })),
});
const input = (over: Partial<ScorecardInput> = {}): ScorecardInput => ({
  name: 'Tabs', template: 'generic', sets: [set(4, [2, 3])], css: '.root { color: var(--ds-text); background: #ff0000; }', buildingBlock: false, knownIssues: 0, questions: 0, described: false, describedProps: 0,
  report: { name: 'Tabs', figmaSets: ['Tabs'], files: [], props: [{ prop: 'size', figma: 'Size (variant)' }, { prop: '—', figma: 'Icon (instance swap)', note: 'Not bound to a layer in Figma; not exposed.' }], assumptions: [], gaps: ['A gap.'], dependencies: {}, nested: { layers: 1, checked: 4, matched: 3, stateVariants: 0, mismatches: [] } },
  ...over,
});
const status = (c: ReturnType<typeof buildScorecard>, n: string) => c.measures.find((m) => m.name === n)!;

describe('scorecards and audit (phase 4, step 12)', () => {
  it('gives each measure its own status and evidence, with no overall score', () => {
    const c = buildScorecard(input());
    expect(c.measures.map((m) => m.name)).toEqual(['Visual fidelity', 'Variants', 'Properties', 'Nested consistency', 'Interaction', 'Tokens', 'Accessibility', 'Documentation', 'Open decisions']);
    expect(status(c, 'Visual fidelity')).toMatchObject({ status: 'n/a' });
    expect(status(c, 'Variants').value).toBe('4 designed variants shown; 2 computed combinations labelled');
    expect(status(c, 'Properties')).toMatchObject({ status: 'warn', value: '1/2 Figma properties mapped; not exposed: Icon' });
    expect(status(c, 'Nested consistency')).toMatchObject({ status: 'fail', value: '3/4 nested values match Figma (1 nested layers)' });
    // Named like an interactive component, but no behaviour template.
    expect(status(c, 'Interaction').status).toBe('warn');
    expect(status(c, 'Tokens')).toMatchObject({ status: 'warn', value: '1 raw colour value (not bound to a variable in Figma)' });
    expect(status(c, 'Documentation').status).toBe('fail');
    expect(status(c, 'Open decisions').value).toBe('0 open questions; 1 generator note');
  });

  it('passes behaviour templates and documented components, and gates visual fidelity', () => {
    const c = buildScorecard(input({ template: 'disclosure', described: true, describedProps: 1, visual: { match: 19, total: 20, worst: 3 } }));
    expect(status(c, 'Interaction')).toMatchObject({ status: 'pass', value: 'WAI-ARIA disclosure pattern, tested in the stories' });
    expect(status(c, 'Documentation').status).toBe('pass');
    expect(status(c, 'Visual fidelity').status).toBe('pass');
    expect(status(buildScorecard(input({ visual: { match: 1, total: 4, worst: 40 } })), 'Visual fidelity').status).toBe('fail');
    expect(scorecardReport([c]).join('\n')).toContain('| Tabs | ✓ | ✓ | ⚠ | ✗ | ✓ | ⚠ | ✓ | ✓ | ⚠ |');
  });

  it('does not take tables for tabs, and credits composites whose items behave', () => {
    expect(status(buildScorecard(input({ name: 'TableRow' })), 'Interaction').status).toBe('n/a');
    expect(status(buildScorecard(input({ name: 'Accordion', itemBehaviour: 'WAI-ARIA disclosure' })), 'Interaction')).toMatchObject({ status: 'pass', value: 'behaviour comes from its items (WAI-ARIA disclosure)' });
    expect(status(buildScorecard(input({ name: 'Tabs', template: 'collection:tablist' })), 'Interaction').value).toBe('WAI-ARIA tabs pattern, tested in the stories');
  });

  it('folds real test results into interaction and accessibility, and lists failing measures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-audit-'));
    const file = join(dir, 'r.json');
    writeFileSync(file, JSON.stringify({ testResults: [
      { name: '/x/src/components/Tabs/Tabs.stories.tsx', assertionResults: [{ status: 'passed' }, { status: 'failed', failureMessages: ['"Elements must meet minimum color contrast ratio thresholds (color-contrast)"'] }] },
      { name: '/x/src/components/Item/Item.stories.tsx', assertionResults: [{ status: 'failed', failureMessages: ['expect(element).toHaveAttribute("aria-expanded", "true")'] }] },
    ] }));
    const t = testTallies(file);
    expect(t.get('Tabs')).toEqual({ passed: 1, failed: 1, contrast: 1, behaviour: 0, other: 0 });
    const tabs = withTests(buildScorecard(input()), t.get('Tabs'));
    expect(status(tabs, 'Accessibility')).toMatchObject({ status: 'fail' });
    const item = withTests(buildScorecard(input({ name: 'Item', template: 'disclosure' })), t.get('Item'));
    expect(status(item, 'Interaction')).toMatchObject({ status: 'fail', value: 'WAI-ARIA disclosure pattern: 1 behaviour test failed' });
    const { failing, text } = auditMarkdown('storybook', '1', [tabs, item]);
    expect(failing.map((f) => `${f.component}/${f.measure}`)).toEqual(['Tabs/Nested consistency', 'Tabs/Accessibility', 'Tabs/Documentation', 'Item/Nested consistency', 'Item/Interaction', 'Item/Documentation']);
    expect(text).toContain('| Interaction | 0 | 1 | 1 | 0 |');
  });
});
