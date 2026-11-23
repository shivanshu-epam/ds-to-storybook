import { describe, expect, it } from 'vitest';

import { addStyles, foundationPages, fromTokens } from '../src/generate/foundations.ts';
import { loadTokens } from '../src/generate/tokens.ts';

const tokens = loadTokens({
  variables: {
    primitives: [
      ['color/blue/500', 'C', '#3366ff'],
      ['size/4', 'F', 16],
      ['radius/md', 'F', 8],
      ['font/family/sans', 'S', 'Inter'],
    ],
    semantic: [
      ['surface/bg/default', 'C', { light: '#ffffff', dark: '#111111' }],
      ['space/inline/md', 'F', '@primitives:size/4'],
      ['stroke/width/default', 'F', 1],
      ['motion/duration/fast', 'F', 150],
      ['opacity/disabled', 'F', 0.4],
      ['text-style/body/md/family', 'S', '@primitives:font/family/sans'],
      ['text-style/body/md/size', 'F', 14],
      ['text-style/body/md/weight', 'F', 400],
      ['text-style/body/md/line-height', 'F', 20],
    ],
  },
});

describe('foundations pages', () => {
  it('sorts variables into sections by name, semantic colours before the palette', () => {
    const f = fromTokens(tokens);
    expect(f.colors.map((c) => c.name)).toEqual(['surface/bg/default', 'color/blue/500']);
    expect(f.colors[0]).toMatchObject({ css: 'var(--surface-bg-default)', value: '#ffffff' });
    expect(f.spacing.map((x) => x.name)).toEqual(['space/inline/md']);
    expect(f.radius.map((x) => x.name)).toEqual(['radius/md']);
    expect(f.sizing.map((x) => x.name)).toEqual(['size/4']);
    expect(f.borders.map((x) => x.name)).toEqual(['stroke/width/default']);
    expect(f.motion.map((x) => x.name)).toEqual(['motion/duration/fast']);
    expect(f.opacity.map((x) => x.name)).toEqual(['opacity/disabled']);
    expect(f.typography).toEqual([expect.objectContaining({ name: 'text-style/body/md', size: 'var(--text-style-body-md-size)', lineHeight: 'var(--text-style-body-md-line-height)' })]);
    expect(f.sources).toEqual({ colors: 'variables', typography: 'variables' });
  });

  it('reads colours, text styles and shadows from the file’s styles when there are no variables', () => {
    const f = addStyles(fromTokens(loadTokens({})), [
      { id: '1:1', name: 'Brand/Primary/500', type: 'FILL', description: '• #1566F1' },
      { id: '1:2', name: 'Desktop/Body/Medium', type: 'TEXT' },
      { id: '1:3', name: 'Elevation/low', type: 'EFFECT' },
    ], {
      '1:1': { id: '1:1', name: 'Brand/Primary/500', type: 'RECTANGLE', fills: [{ type: 'SOLID', color: { r: 0.188, g: 0.369, b: 1, a: 1 } }] },
      '1:2': { id: '1:2', name: 'Desktop/Body/Medium', type: 'TEXT', style: { fontFamily: 'Inter', fontSize: 14, fontWeight: 500, lineHeightPx: 20 } },
      '1:3': { id: '1:3', name: 'Elevation/low', type: 'RECTANGLE', effects: [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 2 }, radius: 4, spread: 0 }] },
    } as never);
    // The fill is the value; a description that only repeats a hex code is not shown.
    expect(f.colors).toEqual([{ name: 'Brand/Primary/500', group: 'Brand / Primary', css: '#305eff', value: '#305eff' }]);
    expect(f.typography[0]).toMatchObject({ size: '14px', weight: '500', lineHeight: '20px', label: 'Inter 14px 500 / 20px' });
    expect(f.shadows[0]!.css).toBe('0px 2px 4px 0px rgba(0, 0, 0, 0.12)');
    expect(foundationPages(f).map((p) => p.title)).toEqual(['Colors', 'Typography', 'Elevation']);
  });

  it('puts Figma’s private groups (a leading "_") and deprecated ones after the public ones', () => {
    const f = fromTokens(loadTokens({ variables: { semantic: [['_internal/x', 'C', '#000000'], ['Deprecated/y', 'C', '#000000'], ['surface/a', 'C', '#ffffff']] } }));
    const html = foundationPages(f)[0]!.html;
    expect(html.indexOf('surface')).toBeLessThan(html.indexOf('_internal'));
    expect(html.indexOf('surface')).toBeLessThan(html.indexOf('Deprecated'));
  });

  it('keeps every style attribute intact (font stacks carry quotes)', () => {
    for (const page of foundationPages(fromTokens(tokens))) {
      for (const [, value] of page.html.matchAll(/style="([^"]*)"/g)) expect(value).not.toMatch(/[<>]/);
      expect(page.html).not.toMatch(/style="[^"]*"[A-Za-z-]+[ ,;]/);
    }
  });
});
