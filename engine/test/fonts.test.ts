import { describe, expect, it } from 'vitest';

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fontFaceCss, fontsReport, planFonts, type FontSource } from '../src/generate/fonts.ts';

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
  it('loads the team’s own font files, with weight and style from each file name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-fonts-'));
    mkdirSync(join(dir, 'brand'));
    for (const f of ['Brand-Regular.woff2', 'Brand-SemiBold.woff2', 'Brand-ExtraBold.otf', 'Brand-BoldItalic.ttf', 'notes.txt']) writeFileSync(join(dir, 'brand', f), '');
    const used = new Map([['Brand Display', { layers: 3, weights: new Set([400, 500, 600]) }]]);
    const [brand] = await planFonts(used, source, { 'Brand Display': { files: ['brand'] } }, dir);
    expect(brand).toMatchObject({ status: 'configured', stack: '"Brand Display", system-ui, sans-serif' });
    expect(brand!.files!.map((f) => [f.to, f.weight, f.style, f.format])).toEqual([
      ['fonts/brand-display/Brand-BoldItalic.ttf', '700', 'italic', 'truetype'],
      ['fonts/brand-display/Brand-ExtraBold.otf', '800', 'normal', 'opentype'],
      ['fonts/brand-display/Brand-Regular.woff2', '400', 'normal', 'woff2'],
      ['fonts/brand-display/Brand-SemiBold.woff2', '600', 'normal', 'woff2'],
    ]);
    expect(brand!.note).toMatch(/weights without a file: 500/);
    const css = fontFaceCss([brand!]);
    expect(css).toContain(`font-family: "Brand Display";\n  src: url('./brand-display/Brand-SemiBold.woff2') format('woff2');\n  font-weight: 600;`);
    expect(fontsReport([brand!]).join('\n')).toContain('font files: 4');
    // A path with no font files is reported, not silently skipped.
    const [none] = await planFonts(used, source, { 'Brand Display': { files: ['missing'] } }, dir);
    expect(none).toMatchObject({ status: 'missing', note: expect.stringMatching(/No font files found at missing/) });
  });
});
