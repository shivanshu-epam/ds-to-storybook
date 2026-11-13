import { describe, expect, it } from 'vitest';

import { fontsReport, planFonts, type FontSource } from '../src/generate/fonts.ts';

const source: FontSource = {
  async meta(id) {
    return ({
      'tasa-orbiter': { family: 'TASA Orbiter', weights: [400, 500, 600, 700, 800], variable: true, category: 'sans-serif' },
      lato: { family: 'Lato', weights: [100, 300, 400, 700, 900], variable: false, category: 'sans-serif' },
    } as Record<string, Awaited<ReturnType<FontSource['meta']>>>)[id];
  },
  async version() {
    return '5.3.0';
  },
};
const used = (entries: [string, number, number[]][]) => new Map(entries.map(([f, n, w]) => [f, { layers: n, weights: new Set(w) }]));

describe('fonts (fidelity step 9)', () => {
  it('loads open-source families from npm, with the weights Figma uses', async () => {
    const [lato] = await planFonts(used([['Lato', 3, [400, 700, 500]]]), source);
    expect(lato).toMatchObject({ status: 'package', package: '@fontsource/lato', version: '5.3.0', imports: ['@fontsource/lato/400.css', '@fontsource/lato/700.css'] });
    expect(lato!.note).toMatch(/500/);
  });

  it('substitutes a family published without its Figma suffix, and says so', async () => {
    const [tasa] = await planFonts(used([['TASA Orbiter Display', 1280, [600]]]), source);
    expect(tasa).toMatchObject({ status: 'substitute', package: '@fontsource-variable/tasa-orbiter', imports: ['@fontsource-variable/tasa-orbiter'] });
    expect(tasa!.stack).toBe('"TASA Orbiter Display", "TASA Orbiter Variable", "TASA Orbiter", system-ui, sans-serif');
    expect(tasa!.note).toMatch(/Confirm/);
  });

  it('keeps system fonts as system stacks and reports unknown families', async () => {
    const plans = await planFonts(used([['SF Pro Text', 2, [400]], ['Menlo', 1, [400]], ['Acme Sans', 4, [400]]]), source);
    expect(plans.find((p) => p.family === 'SF Pro Text')).toMatchObject({ status: 'system' });
    expect(plans.find((p) => p.family === 'Menlo')!.stack).toContain('monospace');
    expect(plans.find((p) => p.family === 'Acme Sans')).toMatchObject({ status: 'missing' });
    expect(fontsReport(plans).join('\n')).toContain('**not loaded**');
  });

  it('uses a configured package for a licensed font', async () => {
    const [acme] = await planFonts(used([['Acme Sans', 4, [400]]]), source, { 'Acme Sans': { package: '@acme/fonts', imports: ['@acme/fonts/sans.css'] } });
    expect(acme).toMatchObject({ status: 'configured', imports: ['@acme/fonts/sans.css'] });
  });
});
