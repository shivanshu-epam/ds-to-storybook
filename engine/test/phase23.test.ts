import { describe, expect, it } from 'vitest';

import type { FigmaNode } from '../src/figma/types.ts';
import { disclosureLayers, drivenProps, genericTemplate, instanceRef, propPlan, type GenericCore, type RegistryEntry } from '../src/generate/templates/generic.ts';
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

// A button: an icon-only axis, a loading axis, a label text. A modal-like set with a viewport axis.
const btnVariant = (id: string, loading: string, iconOnly: string): FigmaNode => ({ id, name: `isLoading=${loading}, iconOnly=${iconOnly}, isDisabled=False`, type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(100, 32), children: [{ id: `${id}f`, name: 'content', type: 'FRAME', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(100, 32), children: [{ id: `${id}t`, name: 'label', type: 'TEXT', characters: 'Pay', componentPropertyReferences: { characters: 'label#1:0' }, absoluteBoundingBox: box(40, 20) }] }] });
const buttonNode: FigmaNode = {
  id: 'U:1', name: 'Button', type: 'COMPONENT_SET',
  componentPropertyDefinitions: { isLoading: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] }, iconOnly: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] }, isDisabled: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] }, 'label#1:0': { type: 'TEXT', defaultValue: 'Pay' } },
  children: [btnVariant('U:2', 'False', 'False'), btnVariant('U:3', 'True', 'False'), btnVariant('U:4', 'False', 'True'), { ...btnVariant('U:5', 'False', 'False'), name: 'isLoading=False, iconOnly=False, isDisabled=True' }],
};
const modalVariant = (id: string, screen: string, w: number): FigmaNode => ({ id, name: `screenSize=${screen}`, type: 'COMPONENT', layoutMode: 'VERTICAL', paddingLeft: w / 25, absoluteBoundingBox: box(w, 200), children: [{ id: `${id}t`, name: 'title', type: 'TEXT', characters: 'Title', absoluteBoundingBox: box(100, 20) }] });
const modalNode: FigmaNode = { id: 'M:1', name: 'Sheet', type: 'COMPONENT_SET', componentPropertyDefinitions: { screenSize: { type: 'VARIANT', defaultValue: 'Desktop', variantOptions: ['Desktop', 'Mobile'] } }, children: [modalVariant('M:2', 'Desktop', 600), modalVariant('M:3', 'Mobile', 360)] };

describe('phase 3: buttons and links; phase 2: responsive axes', () => {
  it('renders a button pack as a native button with aria-busy, native disabled and a story test', () => {
    const r = genericTemplate(ctx(build(buttonNode)), 'Button', { title: 'Button', instance: () => undefined, behavior: 'button' });
    const tsx = file(r, /Button\.tsx$/);
    expect(tsx).toContain('extends Omit<ButtonHTMLAttributes<HTMLButtonElement>');
    expect(tsx).toMatch(/<button type="button" className=\{\[styles\.root, className\]/);
    expect(tsx).toContain('disabled={disabled}');
    expect(tsx).toContain('aria-busy={isLoading || undefined}');
    // Only phrasing content inside the button.
    expect(tsx.slice(tsx.indexOf('<button'))).not.toContain('<div');
    const stories = file(r, /stories\.tsx$/);
    expect(stories).toContain("name: 'Activates'");
    // Icon-only variants have no visible name: stories give one and the report says so.
    expect(stories).toContain("'aria-label': 'Button'");
    expect(r.report.gaps.join(' ')).toMatch(/icon-only variant/);
  });

  it('renders a link pack as a native <a> with href in stories', () => {
    const r = genericTemplate(ctx(build({ ...buttonNode, id: 'N:1', name: 'Link' })), 'Link', { title: 'Link', instance: () => undefined, behavior: 'link' });
    expect(file(r, /Link\.tsx$/)).toMatch(/<a className=\{\[styles\.root, className\]/);
    expect(file(r, /stories\.tsx$/)).toContain("href: '#'");
  });

  it('makes a viewport axis follow configured breakpoints when its prop is not set', async () => {
    const { setBreakpoints } = await import('../src/generate/templates/generic.ts');
    setBreakpoints({ Mobile: '(max-width: 767px)' });
    try {
      const r = genericTemplate(ctx(build(modalNode)), 'Sheet', { title: 'Sheet', instance: () => undefined });
      const tsx = file(r, /Sheet\.tsx$/);
      expect(tsx).toContain("data-screen-size={screenSize ?? 'responsive'}");
      expect(tsx).not.toMatch(/screenSize = 'desktop'/);
      const css = (r.core as GenericCore).css;
      const media = css.indexOf('@media (max-width: 767px)');
      expect(media).toBeGreaterThan(0);
      expect(css.slice(media)).toContain('[data-screen-size="responsive"]');
      // The base (desktop) copy comes before the media query, so the query wins on small screens.
      expect(css.lastIndexOf('[data-screen-size="responsive"]', media)).toBeGreaterThan(0);
    } finally {
      setBreakpoints(undefined);
    }
    // Without breakpoints nothing changes.
    expect(file(genericTemplate(ctx(build(modalNode)), 'Sheet', { title: 'Sheet', instance: () => undefined }), /Sheet\.tsx$/)).toContain("screenSize = 'desktop'");
  });
});

describe('phase 2: repeated children with parent context', () => {
  // A list item with a size axis and a number text; a list that places three copies, numbered, all at its own size.
  const itemNode2: FigmaNode = {
    id: 'I:1', name: 'Item', type: 'COMPONENT_SET',
    componentPropertyDefinitions: { size: { type: 'VARIANT', defaultValue: 'Small', variantOptions: ['Small', 'Large'] }, 'number#1:0': { type: 'TEXT', defaultValue: '1.' } },
    children: ['Small', 'Large'].map((sz, k) => ({ id: `I:${k + 2}`, name: `size=${sz}`, type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(100, sz === 'Small' ? 20 : 40), children: [{ id: `I:${k + 2}t`, name: 'n', type: 'TEXT', characters: '1.', componentPropertyReferences: { characters: 'number#1:0' }, absoluteBoundingBox: box(20, 20) }] })),
  };
  const listVariant = (id: string, sz: string, item: string): FigmaNode => ({
    id, name: `size=${sz}`, type: 'COMPONENT', layoutMode: 'VERTICAL', absoluteBoundingBox: box(100, 120),
    children: [1, 2, 3].map((n) => ({ id: `${id}i${n}`, name: 'item', type: 'INSTANCE', componentId: item, componentProperties: { 'number#1:0': { type: 'TEXT', value: `${n}.` } }, absoluteBoundingBox: box(100, 20), children: [] })),
  });
  const listNode: FigmaNode = { id: 'L:1', name: 'List', type: 'COMPONENT_SET', componentPropertyDefinitions: { size: { type: 'VARIANT', defaultValue: 'Small', variantOptions: ['Small', 'Large'] } }, children: [listVariant('L:2', 'Small', 'I:2'), listVariant('L:3', 'Large', 'I:3')] };

  it('finds what a parent drives on every copy: shared lookups and numbering', () => {
    const shared = { prop: 'size', kind: 'expr' as const, value: '"small"', expr: (r: (p: string) => string) => r('size') };
    const d = drivenProps([[shared, { prop: 'number', kind: 'string', value: '1.' }], [shared, { prop: 'number', kind: 'string', value: '2.' }], [shared, { prop: 'number', kind: 'string', value: '3.' }]]);
    expect(d.map((x) => x.prop)).toEqual(['size', 'number']);
    expect(d[1]!.numbered).toEqual({ prefix: '', start: 1, suffix: '.' });
    // Values that differ without a sequence are not driven.
    expect(drivenProps([[{ prop: 't', kind: 'string', value: 'a' }], [{ prop: 't', kind: 'string', value: 'b' }]])).toEqual([]);
  });

  it('lets consumers pass their own children and fills in what the parent drives on each', () => {
    const items = build(itemNode2);
    const reg = new Map<string, RegistryEntry>(items.variants.map((v) => [v.nodeId, { component: 'Item', importPath: '../Item/Item', kind: 'generic', set: items }]));
    const look = (id: string) => reg.get(id);
    const r = genericTemplate(ctx(build(listNode, { 'I:2': 'size=Small', 'I:3': 'size=Large' })), 'List', {
      title: 'List', lookup: look,
      instance: (part) => { const e = part.instanceComponentId ? reg.get(part.instanceComponentId) : undefined; return e ? instanceRef(e, part, new Map(), look) : undefined; },
    });
    const tsx = file(r, /List\.tsx$/);
    expect(tsx).toContain("import { Children, cloneElement, isValidElement } from 'react';");
    expect(tsx).toContain('children?: ReactNode;');
    expect(tsx).toMatch(/Children\.map\(children, \(child, i\) => <span className=\{styles\.item\} key=\{i\}>\{isValidElement\(child\) && child\.type === Item \? cloneElement\(child, \{ \.\.\.\{ "size": size, "number": `\$\{i \+ 1\}\.` \}, \.\.\.\(child\.props as object\) \}\) : child\}<\/span>\)/);
    // The Figma examples stay the default.
    expect(tsx).toMatch(/<Item size=\{size\} number="2\." \/>/);
    expect(r.report.props.find((x) => x.prop === 'children')?.note).toMatch(/size, number \(numbered\)/);
  });
});
