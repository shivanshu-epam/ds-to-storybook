import { describe, expect, it } from 'vitest';

import { buildComponentSet } from '../src/ir/build.ts';
import { genericTemplate, instanceRef, type GenericCore, type RegistryEntry } from '../src/generate/templates/generic.ts';
import { wcGeneric } from '../src/generate/wc/components.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import type { FigmaNode } from '../src/figma/types.ts';

// An Accordion-shaped family, as in Blade: Accordion (leading: None | Number | Icon) places an item,
// and the item exposes its nested Leading Item (Leading: Number | Icon, leadingNumber text).
const resolver = new TokenResolver(loadTokens({ variables: {} }));
const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const names: Record<string, string> = { 'L:2': 'Leading=Number', 'L:3': 'Leading=Icon', 'I:2': 'state=Default' };
const target = (id: string, name: string) => ({ id, archetype: 'generic', figma: { page: 'p', componentSet: { id, name } } });

const leadingNode: FigmaNode = {
  id: 'L:1', name: '_Leading Item', type: 'COMPONENT_SET',
  componentPropertyDefinitions: { Leading: { type: 'VARIANT', defaultValue: 'Number', variantOptions: ['Number', 'Icon'] }, 'leadingNumber#1:0': { type: 'TEXT', defaultValue: '1.' } },
  children: [
    { id: 'L:2', name: 'Leading=Number', type: 'COMPONENT', absoluteBoundingBox: box(20, 20), children: [{ id: 'L:2t', name: 'n', type: 'TEXT', characters: '1.', componentPropertyReferences: { characters: 'leadingNumber#1:0' }, absoluteBoundingBox: box(20, 20) }] },
    { id: 'L:3', name: 'Leading=Icon', type: 'COMPONENT', absoluteBoundingBox: box(20, 20), children: [{ id: 'L:3r', name: 'glyph', type: 'RECTANGLE', absoluteBoundingBox: box(20, 20) }] },
  ],
};
const itemNode: FigmaNode = {
  id: 'I:1', name: '_Accordion Item', type: 'COMPONENT_SET',
  componentPropertyDefinitions: { state: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default'] }, 'showLeading#2:0': { type: 'BOOLEAN', defaultValue: true }, 'title#3:0': { type: 'TEXT', defaultValue: 'Title' } },
  children: [{
    id: 'I:2', name: 'state=Default', type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(200, 40),
    children: [
      { id: 'I:2l', name: 'Leading Item', type: 'INSTANCE', componentId: 'L:2', isExposedInstance: true, componentPropertyReferences: { visible: 'showLeading#2:0' }, absoluteBoundingBox: box(20, 20), children: [] },
      { id: 'I:2t', name: 'title', type: 'TEXT', characters: 'Title', componentPropertyReferences: { characters: 'title#3:0' }, absoluteBoundingBox: box(100, 20) },
    ],
  }],
};
const accordionVariant = (id: string, leading: string, show: boolean, inner: string): FigmaNode => ({
  id, name: `leading=${leading}`, type: 'COMPONENT', layoutMode: 'VERTICAL', absoluteBoundingBox: box(200, 80),
  children: [{
    id: `${id}i`, name: 'Item', type: 'INSTANCE', componentId: 'I:2', componentProperties: { 'showLeading#2:0': { type: 'BOOLEAN', value: show } }, absoluteBoundingBox: box(200, 40),
    children: [{ id: `${id}l`, name: 'Leading Item', type: 'INSTANCE', componentId: inner, isExposedInstance: true, visible: show, absoluteBoundingBox: box(20, 20), children: [] }],
  }],
});
const accordionNode: FigmaNode = {
  id: 'A:1', name: 'Accordion', type: 'COMPONENT_SET',
  componentPropertyDefinitions: { leading: { type: 'VARIANT', defaultValue: 'None', variantOptions: ['None', 'Number', 'Icon'] } },
  children: [accordionVariant('A:2', 'None', false, 'L:3'), accordionVariant('A:3', 'Number', true, 'L:2'), accordionVariant('A:4', 'Icon', true, 'L:3')],
};

const build = (node: FigmaNode, name: string) => buildComponentSet({ target: target(node.id, name), set: node, docFrames: [], componentNames: names, resolve: () => undefined });
const leadingSet = build(leadingNode, '_Leading Item');
const itemSet = build(itemNode, '_Accordion Item');
const accordionSet = build(accordionNode, 'Accordion');
const registry = new Map<string, RegistryEntry>();
for (const [component, set] of [['LeadingItem', leadingSet], ['AccordionItem', itemSet]] as const) {
  for (const v of set.variants) registry.set(v.nodeId, { component, importPath: `../${component}/${component}`, kind: 'generic', set });
}
const lookup = (id: string) => registry.get(id);
const opts = (title: string) => ({
  title,
  lookup,
  instance: (part: Parameters<typeof instanceRef>[1]) => { const e = part.instanceComponentId ? registry.get(part.instanceComponentId) : undefined; return e ? instanceRef(e, part, new Map(), lookup) : undefined; },
});
const ctx = (main: typeof accordionSet) => ({ fileKey: 'F', version: '1', sets: { main }, resolver, icons: new Map() });
const tsxOf = (r: ReturnType<typeof genericTemplate>, name: string) => r.files.find((f) => f.path.endsWith(`${name}.tsx`))!.content;

describe('nested components (fidelity steps 1-4)', () => {
  it('records exposed nested instances and their configuration in the IR', () => {
    const item = itemSet.variants[0]!.parts.find((p) => p.name === 'Leading Item')!;
    expect(item.exposed).toBe(true);
    const placed = accordionSet.variants.find((v) => v.values.leading === 'Icon')!.parts.find((p) => p.name === 'Item')!;
    expect(placed.exposedInstances).toEqual([{ path: 'Leading Item', name: 'Leading Item', componentId: 'L:3', instanceOf: 'Leading=Icon' }]);
    const hidden = accordionSet.variants.find((v) => v.values.leading === 'None')!.parts.find((p) => p.name === 'Item')!;
    expect(hidden.exposedInstances?.[0]?.hidden).toBe(true);
  });

  const item = genericTemplate(ctx(itemSet), 'AccordionItem', opts('Item'));
  const itemTsx = tsxOf(item, 'AccordionItem');

  it('makes exposed nested properties part of the parent API, passed through', () => {
    expect(itemTsx).toMatch(/leading\?: '?"?number"?'? \| '?"?icon"?'?;/);
    expect(itemTsx).toContain('leadingNumber?: ReactNode;');
    expect(itemTsx).toMatch(/leading = .number./);
    expect(itemTsx).toContain('leading={leading}');
    expect(itemTsx).toContain('leadingNumber={leadingNumber}');
    expect(item.report.props.some((p) => p.prop === 'leading' && /exposed nested instance/.test(p.figma))).toBe(true);
  });

  const accordion = genericTemplate(ctx(accordionSet), 'Accordion', opts('Accordion'));
  const accTsx = tsxOf(accordion, 'Accordion');

  it('maps the parent variant onto nested and exposed nested props', () => {
    // Accordion leading=None hides the leading element; Number and Icon show it.
    expect(accTsx).toContain('showLeading={(({ "number": true, "icon": true } as Record<string, boolean>)[String(leading)] ?? false)}');
    // The exposed Leading Item follows the Accordion: Number -> number, otherwise icon (as Figma sets it).
    expect(accTsx).toMatch(/leading=\{\(\(\{ "number": "number" \} as Record<string, [^>]+>\)\[String\(leading\)\] \?\? "icon"\)\}/);
  });

  it('checks nested consistency against Figma and reports it', () => {
    const n = accordion.report.nested!;
    expect(n.layers).toBe(1);
    expect(n.checked).toBeGreaterThan(0);
    expect(n.matched).toBe(n.checked);
    expect(n.mismatches).toEqual([]);
  });

  it('renders the same mapping in Web Components', () => {
    const wc = wcGeneric(ctx(accordionSet), 'Accordion', accordion.core as GenericCore, { prefix: 'ds', packageName: 'x' }, opts('Accordion').instance, (c) => `ds-${c.toLowerCase()}`);
    const code = wc.files.find((f) => /Accordion\/ds-[a-z-]+\.ts$/.test(f.path))!.content;
    expect(code).toContain('.showLeading=${(({ "number": true, "icon": true } as Record<string, boolean>)[String(this.leading)] ?? false)}');
    const itemWc = wcGeneric(ctx(itemSet), 'AccordionItem', item.core as GenericCore, { prefix: 'ds', packageName: 'x' }, opts('Item').instance, (c) => `ds-${c.toLowerCase()}`);
    const itemCode = itemWc.files.find((f) => /AccordionItem\/ds-[a-z-]+\.ts$/.test(f.path))!.content;
    expect(itemCode).toContain('.leading=${this.leading}');
    expect(itemCode).toMatch(/leading: \{ type: String/);
  });
});
