// ds-sync audit: the scorecards of a generated project, optionally with real story-test results, as one report and a
// gate. Each measure is gated on its own (docs/fidelity/QUALITY.md): --strict fails when any public component fails one.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Measure, MeasureStatus, Scorecard } from '../generate/scorecard.ts';

export interface TestTally { passed: number; failed: number; contrast: number; behaviour: number; other: number }

/** Story-test results per component from a Vitest JSON report (npx vitest run --reporter=json --outputFile=<file>). */
export function testTallies(file: string): Map<string, TestTally> {
  const json = JSON.parse(readFileSync(file, 'utf8')) as { testResults?: { name: string; assertionResults?: { status: string; failureMessages?: string[] }[] }[] };
  const out = new Map<string, TestTally>();
  for (const f of json.testResults ?? []) {
    const m = /src\/components\/([^/]+)\//.exec(f.name);
    if (!m) continue;
    const t = out.get(m[1]!) ?? { passed: 0, failed: 0, contrast: 0, behaviour: 0, other: 0 };
    for (const a of f.assertionResults ?? []) {
      if (a.status === 'passed') { t.passed++; continue; }
      if (a.status !== 'failed') continue;
      t.failed++;
      const msg = (a.failureMessages ?? []).join('\n');
      if (/color-contrast/.test(msg)) t.contrast++;
      else if (/toHaveAttribute|toHaveBeenCalled|getByRole|Unable to find|toHaveFocus/.test(msg)) t.behaviour++;
      else t.other++;
    }
    out.set(m[1]!, t);
  }
  return out;
}

/** Replaces the generation-time Interaction and Accessibility lines with what the tests actually did. */
export function withTests(card: Scorecard, t: TestTally | undefined): Scorecard {
  if (!t) return card;
  const measures = card.measures.map((x): Measure => {
    if (x.name === 'Interaction' && x.status !== 'n/a') return t.behaviour ? { ...x, status: 'fail', value: `${x.value.replace(/, tested in the stories$/, '')}: ${t.behaviour} behaviour test${t.behaviour === 1 ? '' : 's'} failed` } : { ...x, value: `${x.value.replace(/, tested in the stories$/, '')}: tests pass` };
    if (x.name === 'Accessibility') return t.contrast || t.other ? { ...x, status: 'fail', value: `${t.contrast ? `${t.contrast} story test${t.contrast === 1 ? '' : 's'} fail colour contrast (a design issue unless the generator changed colours)` : ''}${t.contrast && t.other ? '; ' : ''}${t.other ? `${t.other} other failing test${t.other === 1 ? '' : 's'}` : ''}` } : { ...x, value: `${x.value}; ${t.passed} story tests pass` };
    return x;
  });
  return { ...card, measures };
}

/** Replaces the Visual fidelity line with a visual check of this Figma version (.ds-sync/visual/summary.json). */
export function withVisual(card: Scorecard, results: { component: string; verdict: string; diff: number }[]): Scorecard {
  const mine = results.filter((r) => r.component === card.component);
  if (!mine.length) return card;
  const match = mine.filter((r) => r.verdict === 'match').length;
  const worst = Math.max(...mine.map((r) => r.diff));
  const pct = match / mine.length;
  return { ...card, measures: card.measures.map((x) => (x.name === 'Visual fidelity' ? { ...x, status: pct >= 0.95 && worst <= 10 ? 'pass' : pct >= 0.5 ? 'warn' : 'fail', value: `${match}/${mine.length} designed variants match Figma (worst ${worst.toFixed(1)}%)` } : x)) };
}

export function loadScorecards(dir: string): { version: string; components: Scorecard[] } | undefined {
  const f = join(dir, 'scorecard.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { version: string; components: Scorecard[] }) : undefined;
}

const ICON: Record<MeasureStatus, string> = { pass: '✓', warn: '⚠', fail: '✗', 'n/a': '–' };

export function auditMarkdown(label: string, version: string, cards: Scorecard[]): { text: string; summary: string; failing: { component: string; measure: string; value: string }[] } {
  const pub = cards.filter((c) => !c.buildingBlock);
  const names = pub[0]?.measures.map((x) => x.name) ?? [];
  const failing = pub.flatMap((c) => c.measures.filter((x) => x.status === 'fail').map((x) => ({ component: c.component, measure: x.name, value: x.value })));
  const by = (n: string, s: MeasureStatus) => pub.filter((c) => c.measures.find((x) => x.name === n)?.status === s).length;
  const summary = [
    `**Fidelity audit (${label}):** ${pub.length} public components; each measure gated on its own.`,
    '',
    '| Measure | ✓ | ⚠ | ✗ | – |',
    '| --- | --- | --- | --- | --- |',
    ...names.map((n) => `| ${n} | ${by(n, 'pass')} | ${by(n, 'warn')} | ${by(n, 'fail')} | ${by(n, 'n/a')} |`),
    '',
    ...(failing.length ? [`<details><summary>${failing.length} failing measure${failing.length === 1 ? '' : 's'}</summary>`, '', ...failing.map((f) => `- **${f.component}**, ${f.measure}: ${f.value}`), '', '</details>', ''] : ['No failing measures.', '']),
  ].join('\n');
  const text = [
    `# Fidelity audit: ${label}`,
    '',
    `Figma version ${version}. ${pub.length} public components (building blocks excluded). Each measure is gated on its own; there is no overall score.`,
    '',
    '| Measure | ✓ | ⚠ | ✗ | – |',
    '| --- | --- | --- | --- | --- |',
    ...names.map((n) => `| ${n} | ${by(n, 'pass')} | ${by(n, 'warn')} | ${by(n, 'fail')} | ${by(n, 'n/a')} |`),
    '',
    failing.length ? '## Failing' : '## Failing: none',
    '',
    ...failing.map((f) => `- **${f.component}**, ${f.measure}: ${f.value}`),
    '',
    '## Per component',
    '',
    `| Component | ${names.join(' | ')} |`,
    `| --- | ${names.map(() => '---').join(' | ')} |`,
    ...pub.map((c) => `| ${c.component} | ${c.measures.map((x) => ICON[x.status]).join(' | ')} |`),
    '',
  ].join('\n');
  return { text, summary, failing };
}
