// The documentation gate (docs/DOCS-ENGINE.md, roadmap phase 6): the doc specs of a generated Storybook against a
// reviewed baseline. A new gap (a Figma item no longer in Storybook, a required section gone) fails the check; known
// gaps recorded in the baseline do not, so a team can adopt the gate before every gap is closed.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DocSpec } from './types.ts';

export interface Baseline {
  version: 1;
  /** Storybook folder -> component -> gap items accepted for now. */
  targets: Record<string, Record<string, string[]>>;
}

export interface CheckResult {
  dir: string;
  components: number;
  complete: number;
  /** Gaps not in the baseline: these fail the check. */
  added: { component: string; item: string; message: string }[];
  /** Baseline gaps that are now closed. */
  fixed: { component: string; item: string }[];
  /** Gaps the baseline accepts. */
  known: number;
}

export function loadSpecs(dir: string): DocSpec[] | undefined {
  const folder = join(dir, 'docspec');
  if (!existsSync(folder)) return undefined;
  return readdirSync(folder).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(folder, f), 'utf8')) as DocSpec);
}

export function checkSpecs(dir: string, specs: DocSpec[], accepted: Record<string, string[]> | undefined): CheckResult {
  const r: CheckResult = { dir, components: specs.length, complete: specs.filter((s) => s.coverage.complete).length, added: [], fixed: [], known: 0 };
  for (const s of specs) {
    const base = new Set(accepted?.[s.component] ?? []);
    for (const g of s.gaps) {
      if (base.has(g.item)) r.known++;
      else r.added.push({ component: s.component, item: g.item, message: g.message });
    }
    for (const item of base) if (!s.gaps.some((g) => g.item === item)) r.fixed.push({ component: s.component, item });
  }
  // A component that left the Figma file takes its accepted gaps with it.
  for (const [component, items] of Object.entries(accepted ?? {})) if (!specs.some((s) => s.component === component)) for (const item of items) r.fixed.push({ component, item });
  return r;
}

export function baselineOf(specs: DocSpec[]): Record<string, string[]> {
  return Object.fromEntries(specs.filter((s) => s.gaps.length).map((s) => [s.component, s.gaps.map((g) => g.item)]));
}

export function checkMarkdown(results: CheckResult[], strict: boolean): string {
  const lines = ['# Documentation check', '', strict ? 'Strict: every gap fails.' : 'Against the reviewed baseline (ds-sync.docs-baseline.json): new gaps fail; known gaps are listed in each DOCS-COVERAGE.md.', ''];
  for (const r of results) {
    lines.push(`## ${r.dir}`, '', `- Components complete: ${r.complete}/${r.components}`, `- New gaps: ${r.added.length}`, `- Known gaps (baseline): ${r.known}`, `- Gaps closed since the baseline: ${r.fixed.length}`, '');
    if (r.added.length) lines.push('### New gaps', '', ...r.added.map((a) => `- ${a.component}: ${a.message}`), '');
    if (r.fixed.length) lines.push('### Closed (update the baseline to keep them closed)', '', ...r.fixed.map((f) => `- ${f.component}: ${f.item}`), '');
  }
  return lines.join('\n') + '\n';
}
