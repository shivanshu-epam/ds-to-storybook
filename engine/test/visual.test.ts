import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';

import { storyId } from '../src/generate/index.ts';
import { compare, verdict } from '../src/visual/visual.ts';

const png = (w: number, h: number, rgba: [number, number, number, number]) => {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) p.data.set(rgba, i * 4);
  return PNG.sync.write(p);
};

describe('visual check', () => {
  it('builds Storybook story ids', () => {
    expect(storyId('Components/Radio/RadioControl', 'FigmaVariants')).toBe('components-radio-radiocontrol--figma-variants');
    expect(storyId('Components/Date Picker/DatePicker', 'FigmaVariants')).toBe('components-date-picker-datepicker--figma-variants');
  });

  it('treats transparent pixels as white, so backgrounds do not count as differences', () => {
    expect(compare(png(10, 10, [0, 0, 0, 0]), png(10, 10, [255, 255, 255, 255])).diff).toBe(0);
  });

  it('counts different pixels, including size differences', () => {
    expect(compare(png(10, 10, [255, 0, 0, 255]), png(10, 10, [0, 0, 255, 255])).diff).toBe(100);
    expect(compare(png(10, 10, [255, 0, 0, 255]), png(10, 5, [255, 0, 0, 255])).diff).toBe(50);
  });

  it('grades results', () => {
    const r = { component: 'X', nodeId: '1', name: 'n', figmaSize: [10, 10] as [number, number], codeSize: [10, 10] as [number, number] };
    expect(verdict({ ...r, diff: 1 })).toBe('match');
    expect(verdict({ ...r, diff: 5 })).toBe('check');
    expect(verdict({ ...r, diff: 1, codeSize: [12, 10] })).toBe('check');
    expect(verdict({ ...r, diff: 30 })).toBe('differs');
  });
});
