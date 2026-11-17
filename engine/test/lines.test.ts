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

describe('font weight from the style name', async () => {
  const { weightOf } = await import('../src/ir/build.ts');
  it('prefers the named style over a reported weight that disagrees', () => {
    expect(weightOf('Medium', 400)).toBe(500);
    expect(weightOf('SemiBold', 600)).toBe(600);
    expect(weightOf('Bold Italic', 400)).toBe(700);
    expect(weightOf('Condensed', 300)).toBe(300);
    expect(weightOf(undefined, 400)).toBe(400);
  });
});

describe('layers a parent restyles inside a nested component', async () => {
  const { genericTemplate: gt, layers: _l } = await import('../src/generate/templates/generic.ts');
  void _l;
  // A "Price" set with Size=Small/Large placing a "Digits" component whose text it resizes (a Figma instance override).
  const digitsNode: FigmaNode = { id: 'DG:1', name: 'Digits', type: 'COMPONENT_SET', componentPropertyDefinitions: {}, children: [{ id: 'DG:2', name: 'Default', type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 20 }, children: [{ id: 'DG:2t', name: 'value', type: 'TEXT', characters: '1,000', style: { fontSize: 14, fontWeight: 400 }, absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 20 } }] }] } as FigmaNode;
  const placed = (vid: string, size: number): FigmaNode => ({ id: `${vid}i`, name: 'digits', type: 'INSTANCE', componentId: 'DG:2', absoluteBoundingBox: { x: 0, y: 0, width: 60, height: size + 6 }, overrides: [{ id: `I${vid}i;DG:2t`, overriddenFields: ['fontSize', 'text'] }], children: [{ id: `I${vid}i;DG:2t`, name: 'value', type: 'TEXT', characters: '1,000', style: { fontSize: size, fontWeight: 400 }, absoluteBoundingBox: { x: 0, y: 0, width: 60, height: size + 6 } }] } as FigmaNode);
  const priceNode: FigmaNode = { id: 'PR:1', name: 'Price', type: 'COMPONENT_SET', componentPropertyDefinitions: { Size: { type: 'VARIANT', defaultValue: 'Small', variantOptions: ['Small', 'Large'] } },
    children: [['PR:2', 'Small', 14], ['PR:3', 'Large', 32]].map(([id, v, n]) => ({ id: id as string, name: `Size=${v}`, type: 'COMPONENT' as const, layoutMode: 'HORIZONTAL' as const, absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 40 }, children: [placed(id as string, n as number)] })) } as FigmaNode;
  const digits = buildComponentSet({ target: { id: 'DG:1', archetype: 'generic', figma: { page: 'p', componentSet: { id: 'DG:1', name: 'Digits' } } }, set: digitsNode, docFrames: [], componentNames: {}, resolve: () => undefined });
  const entry = { component: 'Digits', importPath: '../Digits/Digits', kind: 'generic' as const, set: digits };
  const price = buildComponentSet({ target: { id: 'PR:1', archetype: 'generic', figma: { page: 'p', componentSet: { id: 'PR:1', name: 'Price' } } }, set: priceNode, docFrames: [], componentNames: { 'DG:2': 'Default' }, resolve: () => undefined });

  it('records the restyled layer and styles it through data-layer and ::part, only with the overridden property', () => {
    expect(price.variants[1]!.parts[0]!.inner?.[0]).toMatchObject({ path: 'value', fields: ['fontSize'] });
    const r = gt({ fileKey: 'F', version: '1', sets: { main: price }, resolver, icons: new Map() }, 'Price', { title: 'Price', lookup: (id) => (id === 'DG:2' ? entry : undefined), instance: (p) => (p.instanceComponentId === 'DG:2' ? { component: 'Digits', importPath: '../Digits/Digits', attrs: [], props: [], notes: [], kind: 'generic', usesIcon: false } : undefined) });
    const css = (r.core as GenericCore).css;
    expect(css).toContain('.root:where([data-size="large"]) .digits [data-layer="value"], .root:where([data-size="large"]) .digits ::part(value) {\n  font-size: 32px;\n}');
    const rule = css.slice(css.indexOf('[data-layer="value"]'));
    expect(rule.slice(0, rule.indexOf('}'))).not.toMatch(/font-weight|color|display/);
  });
});

describe('Figma constraints on layers outside auto layout', () => {
  it('stretches a layer pinned left and right, and scales one set to scale', () => {
    const node: FigmaNode = { id: 'K:1', name: 'Ring', type: 'COMPONENT_SET', componentPropertyDefinitions: { kind: { type: 'VARIANT', defaultValue: 'A', variantOptions: ['A'] } },
      children: [{ id: 'K:2', name: 'kind=A', type: 'COMPONENT', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 }, children: [
        { id: 'K:3', name: 'fill', type: 'FRAME', constraints: { horizontal: 'LEFT_RIGHT', vertical: 'TOP_BOTTOM' }, absoluteBoundingBox: { x: 2, y: 2, width: 96, height: 36 }, children: [] },
        { id: 'K:4', name: 'half', type: 'FRAME', constraints: { horizontal: 'SCALE', vertical: 'TOP' }, absoluteBoundingBox: { x: 50, y: 0, width: 50, height: 10 }, children: [] },
      ] }] } as FigmaNode;
    const out = css(node);
    const fill = rule(out, '.root .fill {');
    expect(fill).toMatch(/left: 2px;[\s\S]*right: 2px;/);
    expect(fill).toMatch(/bottom: 2px;/);
    expect(fill).not.toMatch(/width:|height:/);
    const half = rule(out, '.root .half {');
    expect(half).toContain('left: 50%;');
    expect(half).toContain('width: 50%;');
  });
});
