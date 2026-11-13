import { describe, expect, it } from 'vitest';

import type { FigmaNode } from '../src/figma/types.ts';
import { disclosureLayers, genericTemplate, propPlan, type GenericCore, type RegistryEntry } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { wcGeneric } from '../src/generate/wc/components.ts';
import { buildComponentSet } from '../src/ir/build.ts';

const resolver = new TokenResolver(loadTokens({ variables: {} }));
const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const target = (id: string, name: string) => ({ id, archetype: 'generic', figma: { page: 'p', componentSet: { id, name } } });
const build = (node: FigmaNode, names: Record<string, string> = {}) => buildComponentSet({ target: target(node.id, node.name), set: node, docFrames: [], componentNames: names, resolve: () => undefined });
const ctx = (main: ReturnType<typeof build>) => ({ fileKey: 'F', version: '1', sets: { main }, resolver, icons: new Map() });
const file = (r: ReturnType<typeof genericTemplate>, re: RegExp) => r.files.find((f) => re.test(f.path))!.content;

// Badge-like: a leading icon slot (boolean + instance swap bound to the same layer) and a placeholder "Slot" instance.
const slotNode: FigmaNode = { id: 'S:1', name: 'Slot', type: 'COMPONENT_SET', componentPropertyDefinitions: {}, children: [{ id: 'S:2', name: 'Default', type: 'COMPONENT', absoluteBoundingBox: box(40, 20), children: [] }] };
const glyph: FigmaNode = { id: 'G:1', name: 'Glyph', type: 'COMPONENT_SET', componentPropertyDefinitions: {}, children: [{ id: 'G:2', name: 'Default', type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(60, 20), children: [{ id: 'G:2t', name: 't', type: 'TEXT', characters: 'G', absoluteBoundingBox: box(20, 20) }] }] };
const badgeNode: FigmaNode = {
  id: 'B:1', name: 'Badge', type: 'COMPONENT_SET',
  componentPropertyDefinitions: { 'showLeadingIcon#1:0': { type: 'BOOLEAN', defaultValue: true }, 'leadingIcon#2:0': { type: 'INSTANCE_SWAP', defaultValue: 'G:2' }, 'label#3:0': { type: 'TEXT', defaultValue: 'New' } },
  children: [{
    id: 'B:2', name: 'Default', type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(120, 40),
    children: [
      { id: 'B:2i', name: 'leadingIcon', type: 'INSTANCE', componentId: 'G:2', componentPropertyReferences: { visible: 'showLeadingIcon#1:0', mainComponent: 'leadingIcon#2:0' }, absoluteBoundingBox: box(60, 20), children: [] },
      { id: 'B:2t', name: 'label', type: 'TEXT', characters: 'New', componentPropertyReferences: { characters: 'label#3:0' }, absoluteBoundingBox: box(40, 20) },
      { id: 'B:2s', name: 'content', type: 'INSTANCE', componentId: 'S:2', absoluteBoundingBox: box(40, 20), children: [] },
    ],
  }],
};
const slotSet = build(slotNode);
const glyphSet = build(glyph);
const registry = new Map<string, RegistryEntry>([['S:2', { component: 'Slot', importPath: '../Slot/Slot', kind: 'generic', set: slotSet }], ['G:2', { component: 'Glyph', importPath: '../Glyph/Glyph', kind: 'generic', set: glyphSet }]]);
const lookup = (id: string) => registry.get(id);
const instance = (part: { instanceComponentId?: string }) => { const e = part.instanceComponentId ? registry.get(part.instanceComponentId) : undefined; return e ? { component: e.component, importPath: e.importPath, attrs: [], props: [], notes: [], kind: e.kind } : undefined; };

// Checkbox-like: isChecked + isIntermediate axes and a label text.
const checkVariant = (id: string, checked: string, mixed: string): FigmaNode => ({ id, name: `isChecked=${checked}, isIntermediate=${mixed}`, type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(120, 20), children: [{ id: `${id}t`, name: 'label', type: 'TEXT', characters: 'Option', componentPropertyReferences: { characters: 'label#1:0' }, absoluteBoundingBox: box(80, 20) }] });
const checkboxNode: FigmaNode = {
  id: 'K:1', name: 'Checkbox', type: 'COMPONENT_SET',
  componentPropertyDefinitions: { isChecked: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] }, isIntermediate: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] }, 'label#1:0': { type: 'TEXT', defaultValue: 'Option' } },
  children: [checkVariant('K:2', 'False', 'False'), checkVariant('K:3', 'True', 'False'), checkVariant('K:4', 'False', 'True')],
};

// Accordion-item-like: a header shown always, a body shown only when isExpanded=True, inside a "root" wrapper.
const itemVariant = (id: string, open: boolean): FigmaNode => ({
  id, name: `isExpanded=${open ? 'True' : 'False'}`, type: 'COMPONENT', layoutMode: 'VERTICAL', absoluteBoundingBox: box(300, 100),
  children: [{ id: `${id}r`, name: 'root', type: 'FRAME', layoutMode: 'VERTICAL', absoluteBoundingBox: box(300, 100), children: [
    { id: `${id}h`, name: 'header', type: 'FRAME', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(300, 40), children: [{ id: `${id}ht`, name: 'title', type: 'TEXT', characters: 'Question', absoluteBoundingBox: box(200, 20) }] },
    { id: `${id}b`, name: 'body', type: 'FRAME', visible: open, absoluteBoundingBox: box(300, 60), children: [{ id: `${id}bt`, name: 'answer', type: 'TEXT', characters: 'Answer', absoluteBoundingBox: box(200, 20) }] },
  ] }],
});
const itemNode: FigmaNode = { id: 'A:1', name: '_Accordion Item', type: 'COMPONENT_SET', componentPropertyDefinitions: { isExpanded: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] } }, children: [itemVariant('A:2', false), itemVariant('A:3', true)] };

describe('phase 2: slots', () => {
  const badge = genericTemplate(ctx(build(badgeNode, { 'G:2': 'Default', 'S:2': 'Default' })), 'Badge', { title: 'Badge', instance: instance as never, lookup });
  const tsx = file(badge, /Badge\.tsx$/);
  it('turns an instance swap bound to a layer into a content prop with the Figma instance as default', () => {
    expect(tsx).toContain('leadingIcon?: ReactNode;');
    expect(tsx).toMatch(/\{showLeadingIcon && \(\s*<span className=\{styles\.leadingIcon\}>\{leadingIcon \?\? \(<Glyph \/>\)\}<\/span>/);
    expect(badge.report.props.find((x) => x.prop === 'leadingIcon')?.note).toMatch(/Slot/);
    expect(badge.report.gaps.join(' ')).not.toMatch(/Instance swap properties not exposed/);
  });
  it('turns a placeholder "Slot" instance into children', () => {
    expect(tsx).toMatch(/\{children \?\? \(<Slot \/>\)\}/);
    expect(file(badge, /stories\.tsx$/)).toContain("children: { control: false");
  });
  it('renders slots as native <slot> elements in Web Components, with the Figma default as fallback', () => {
    const wc = wcGeneric(ctx((badge.core as GenericCore).set) as never, 'Badge', badge.core as GenericCore, { prefix: 'ds', packageName: 'p' }, instance as never, (c) => `ds-${c.toLowerCase()}`);
    const code = wc.files.find((f) => /ds-badge\.ts$/.test(f.path))!.content;
    expect(code).toContain('<slot name="leading-icon"><ds-glyph></ds-glyph></slot>');
    expect(code).toContain('<slot><ds-slot></ds-slot></slot>');
  });
});

describe('phase 3: behaviour from structure', () => {
  it('makes a set with a checked axis a WAI-ARIA checkbox, with a mixed state and its own label as the name', () => {
    const r = genericTemplate(ctx(build(checkboxNode)), 'Checkbox', { title: 'Checkbox', instance: () => undefined, behavior: 'checkbox-single' });
    const tsx = file(r, /Checkbox\.tsx$/);
    expect(tsx).toContain('role="checkbox"');
    expect(tsx).toContain("aria-checked={isIntermediate ? 'mixed' : on}");
    expect(tsx).toContain("if (event.key === 'Enter') event.preventDefault();");
    const stories = file(r, /stories\.tsx$/);
    expect(stories).toContain("getByRole('checkbox')");
    expect(stories).not.toContain("'aria-label'");
    expect(r.report.gaps.join(' ')).not.toMatch(/no label/);
  });

  it('finds the header and panel of a disclosure from visibility, looking through a wrapper', () => {
    const set = build(itemNode);
    expect(disclosureLayers(set, propPlan(set).axes)).toMatchObject({ header: 'root/header', panel: 'root/body' });
    // A trigger with an expanded axis but no panel (a dropdown trigger) is not a disclosure.
    const trigger = build({ ...itemNode, id: 'T:1', name: 'Trigger', children: [itemVariant('T:2', false), itemVariant('T:3', true)].map((v) => ({ ...v, children: [{ ...v.children![0]!, children: [v.children![0]!.children![0]!] }] })) });
    expect(disclosureLayers(trigger, propPlan(trigger).axes)).toBeUndefined();
  });

  it('generates a controlled or uncontrolled disclosure: header button with aria-expanded and aria-controls', () => {
    const r = genericTemplate(ctx(build(itemNode)), 'AccordionItem', { title: 'Item', instance: () => undefined, behavior: 'disclosure' });
    const tsx = file(r, /AccordionItem\.tsx$/);
    expect(tsx).toContain("import { useId, useState, type HTMLAttributes } from 'react';");
    expect(tsx).toContain('isExpanded: isExpandedProp');
    expect(tsx).toContain('const isExpanded = isExpandedProp ?? innerExpanded;');
    expect(tsx).toMatch(/<button type="button" className=\{styles\.header\} aria-expanded=\{isExpanded\} aria-controls=\{panelId\} onClick=\{toggleExpanded\}>/);
    expect(tsx).toMatch(/className=\{styles\.body\} id=\{panelId\}/);
    // Inside the button only phrasing content.
    expect(tsx.slice(tsx.indexOf('<button'), tsx.indexOf('</button>'))).not.toContain('<div');
    expect(file(r, /stories\.tsx$/)).toContain("name: 'Expands and collapses'");
    expect((r.core as GenericCore).css).toContain(':where(button.header)');
  });
});
