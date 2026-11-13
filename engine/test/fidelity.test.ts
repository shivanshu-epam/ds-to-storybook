import { describe, expect, it } from 'vitest';

import { linearGradient, styleOf } from '../src/ir/build.ts';
import { buildComponentSet } from '../src/ir/build.ts';
import { genericTemplate } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import type { FigmaNode } from '../src/figma/types.ts';

const resolver = new TokenResolver(loadTokens({ variables: {} }));
const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });

describe('fidelity fixes found by the visual check', () => {
  it('converts a Figma linear gradient to CSS', () => {
    const p = { type: 'GRADIENT_LINEAR', gradientHandlePositions: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }], gradientStops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }] };
    expect(linearGradient(p, 100, 50)).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  it('keeps the stroke dash pattern', () => {
    const s = styleOf({ id: '1', name: 'line', type: 'RECTANGLE', strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }], strokeDashes: [2, 4], absoluteBoundingBox: box(48, 2) } as FigmaNode, () => undefined);
    expect(s.dashes).toEqual([2, 4]);
  });

  const variant = (id: string, name: string, order: 'label-first' | 'text-first', button: string): FigmaNode => ({
    id, name, type: 'COMPONENT', layoutMode: 'VERTICAL', absoluteBoundingBox: box(200, 100),
    children: [
      { id: `${id}r`, name: 'row', type: 'FRAME', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(200, 20), children: order === 'label-first'
        ? [{ id: `${id}a`, name: 'dot', type: 'ELLIPSE', absoluteBoundingBox: box(10, 10) }, { id: `${id}b`, name: 'text', type: 'TEXT', characters: 'Item', absoluteBoundingBox: box(40, 20) }]
        : [{ id: `${id}b`, name: 'text', type: 'TEXT', characters: 'Item', absoluteBoundingBox: box(40, 20) }, { id: `${id}a`, name: 'dot', type: 'ELLIPSE', absoluteBoundingBox: box(10, 10) }] },
      { id: `${id}f1`, name: 'field', type: 'FRAME', absoluteBoundingBox: box(200, 20), children: [{ id: `${id}f1t`, name: 'label', type: 'TEXT', characters: 'Full name', absoluteBoundingBox: box(60, 20) }] },
      { id: `${id}f2`, name: 'field', type: 'FRAME', absoluteBoundingBox: box(200, 20), children: [{ id: `${id}f2t`, name: 'label', type: 'TEXT', characters: 'Email', absoluteBoundingBox: box(60, 20) }] },
      { id: `${id}c`, name: 'cta', type: 'TEXT', characters: button, absoluteBoundingBox: box(60, 20) },
    ],
  } as FigmaNode);
  const node: FigmaNode = {
    id: '3:1', name: 'Card', type: 'COMPONENT_SET',
    componentPropertyDefinitions: { Position: { type: 'VARIANT', defaultValue: 'Left', variantOptions: ['Left', 'Right'] } },
    children: [variant('3:2', 'Position=Left', 'label-first', 'Confirm'), variant('3:3', 'Position=Right', 'text-first', 'Save changes')],
  };
  const set = buildComponentSet({ target: { id: 'c', archetype: 'generic', figma: { page: 'p', componentSet: { id: '3:1', name: 'Card' } } }, set: node, docFrames: [], componentNames: {}, resolve: () => undefined });
  const r = genericTemplate({ fileKey: 'F', version: '1', sets: { main: set }, resolver, icons: new Map() }, 'Card', { title: 'C', instance: () => undefined });
  const tsx = r.files.find((f) => f.path.endsWith('Card.tsx'))!.content;
  const css = r.files.find((f) => f.path.endsWith('.module.css'))!.content;

  it('renders repeated frames with one name separately', () => {
    expect(tsx).toContain('"Full name"');
    expect(tsx).toContain('"Email"');
  });

  it('follows Figma when it reorders layers between variants', () => {
    expect(css).toMatch(/\[data-position="right"\]\) \.dot \{[^}]*order: 1;/);
  });

  it('turns text that changes with a variant property into a lookup', () => {
    expect(tsx).toContain('({"right":"Save changes"} as Record<string, string>)[position] ?? "Confirm"');
  });
});
