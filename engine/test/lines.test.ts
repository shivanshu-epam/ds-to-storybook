import { describe, expect, it } from 'vitest';

import type { FigmaNode } from '../src/figma/types.ts';
import { genericTemplate, type GenericCore } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { buildComponentSet } from '../src/ir/build.ts';

const resolver = new TokenResolver(loadTokens({ variables: {} }));
const css = (node: FigmaNode) => {
  const set = buildComponentSet({ target: { id: node.id, archetype: 'generic', figma: { page: 'p', componentSet: { id: node.id, name: node.name } } }, set: node, docFrames: [], componentNames: {}, resolve: () => undefined });
  return (genericTemplate({ fileKey: 'F', version: '1', sets: { main: set }, resolver, icons: new Map() }, 'Rule', { title: 'Rule', instance: () => undefined }).core as GenericCore).css;
};
const rule = (css: string, sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)) + 1);

// A Blade-like divider: a 120 x 0 frame holding a LINE whose stroke Figma paints entirely above it (render bounds).
const lineSet = (weight: number, dashes?: number[]): FigmaNode => ({
  id: 'D:1', name: 'Rule', type: 'COMPONENT_SET', componentPropertyDefinitions: { kind: { type: 'VARIANT', defaultValue: 'A', variantOptions: ['A'] } },
  children: [{
    id: 'D:2', name: 'kind=A', type: 'COMPONENT', absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 0 }, absoluteRenderBounds: { x: 0, y: -weight, width: 120, height: weight },
    children: [{ id: 'D:2l', name: 'line', type: 'LINE', strokes: [{ type: 'SOLID', color: { r: 0.5, g: 0.6, b: 0.7, a: 1 } }], strokeWeight: weight, ...(dashes ? { strokeDashes: dashes } : {}), absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 0 }, absoluteRenderBounds: { x: 0, y: -weight, width: 120, height: weight } }],
  }],
});

describe('lines and dividers', () => {
  it('draws a zero-thickness line where Figma paints it, as thick as Figma paints it, without moving the layout', () => {
    const r = rule(css(lineSet(1.5)), '.root .line');
    expect(r).toContain('background: #8099b3');
    expect(r).toContain('padding: 1.5px 0 0px');
    expect(r).toContain("margin: -1.5px 0 0px");
    expect(r).not.toMatch(/border-width|box-shadow: 0 0 0/);
  });

  it('draws a dashed line with the Figma dash pattern on the same box', () => {
    const r = rule(css(lineSet(0.5, [5, 5])), '.root .line');
    expect(r).toMatch(/background: repeating-linear-gradient\(90deg, #8099b3 0 2\.5px/);
    expect(r).toContain('padding: 0.5px 0 0px');
  });
});
