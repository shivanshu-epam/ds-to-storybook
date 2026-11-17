import { describe, expect, it } from 'vitest';

import { discover } from '../src/discover/discover.ts';
import type { FigmaReader } from '../src/figma/client.ts';
import type { FigmaNode } from '../src/figma/types.ts';
import { genericTemplate, instanceRef, type GenericCore, type RegistryEntry } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { wcGeneric } from '../src/generate/wc/components.ts';
import { buildComponentSet } from '../src/ir/build.ts';

const resolver = new TokenResolver(loadTokens({ variables: {} }));
const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const build = (node: FigmaNode, names: Record<string, string> = {}) => buildComponentSet({ target: { id: node.id, archetype: 'generic', figma: { page: 'p', componentSet: { id: node.id, name: node.name } } }, set: node, docFrames: [], componentNames: names, resolve: () => undefined });
const ctx = (main: ReturnType<typeof build>) => ({ fileKey: 'F', version: '1', sets: { main }, resolver, icons: new Map() });
const file = (r: ReturnType<typeof genericTemplate>, re: RegExp) => r.files.find((f) => re.test(f.path))!.content;

// An Action List item: isSelected and a content type with a separator and a heading.
const kinds = ['Item', 'Separator', 'Section Heading'];
const optionNode: FigmaNode = {
  id: 'O:1', name: '_Option Item', type: 'COMPONENT_SET',
  componentPropertyDefinitions: { contentType: { type: 'VARIANT', defaultValue: 'Item', variantOptions: kinds }, isSelected: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] }, 'title#1:0': { type: 'TEXT', defaultValue: 'Option' } },
  children: kinds.flatMap((c, i) => ['False', 'True'].map((s, j) => ({ id: `O:${i}${j}`, name: `contentType=${c}, isSelected=${s}`, type: 'COMPONENT' as const, layoutMode: 'HORIZONTAL' as const, absoluteBoundingBox: box(200, 32), children: [{ id: `O:${i}${j}t`, name: 'title', type: 'TEXT' as const, characters: 'Option', componentPropertyReferences: { characters: 'title#1:0' }, absoluteBoundingBox: box(100, 20) }] }))),
};
const options = build(optionNode);
const id = (content: number, selected: boolean) => `O:${content}${selected ? 1 : 0}`;
const names = Object.fromEntries(options.variants.map((v) => [v.nodeId, v.name]));
const reg = new Map<string, RegistryEntry>(options.variants.map((v) => [v.nodeId, { component: 'OptionItem', importPath: '../OptionItem/OptionItem', kind: 'generic', set: options }]));
const look = (x: string) => reg.get(x);
const inst = (part: { instanceComponentId?: string }) => { const e = part.instanceComponentId ? reg.get(part.instanceComponentId) : undefined; return e ? instanceRef(e, part as never, new Map(), look) : undefined; };

/** A group of items: heading, option, selected option, separator, option. */
const listOf = (nodeId: string, name: string, items: string[], axes: FigmaNode['componentPropertyDefinitions'] = {}): FigmaNode => ({
  id: nodeId, name, type: 'COMPONENT_SET', componentPropertyDefinitions: axes,
  children: [{ id: `${nodeId}v`, name: Object.entries(axes ?? {}).map(([k, d]) => `${k}=${(d as { defaultValue: string }).defaultValue}`).join(', ') || 'Default', type: 'COMPONENT', layoutMode: 'VERTICAL', absoluteBoundingBox: box(200, 200), children:
    items.map((c, k) => ({ id: `${nodeId}i${k}`, name: 'item', type: 'INSTANCE' as const, componentId: c, absoluteBoundingBox: box(200, 32), children: [] })) }],
});

describe('listbox and menu from repeated items', () => {
  const items = [id(2, false), id(0, false), id(0, true), id(1, false), id(0, false)];
  const r = genericTemplate(ctx(build(listOf('L:1', 'Option List', items, { selectionType: { type: 'VARIANT', defaultValue: 'Single', variantOptions: ['Single', 'Multi'] } }), names)), 'OptionList', { title: 'OptionList', lookup: look, instance: inst as never });
  const tsx = file(r, /OptionList\.tsx$/);
  const core = r.core as GenericCore;

  it('makes items with a selected axis, in a set named as a list, a WAI-ARIA listbox with one tab stop', () => {
    expect(core.collection?.role).toBe('listbox');
    expect(tsx).toContain("const listProps = { role: 'listbox', tabIndex: 0, 'aria-activedescendant': active >= 0 ? `${labelId}-${active}` : undefined, 'aria-label': \"Option list\", 'aria-multiselectable': multiple || undefined, onKeyDown: moveActive };");
    expect(tsx).toContain('const multiple = selectionType === "multi";');
    expect(tsx).toContain('{...listProps}');
  });

  it('keeps separators and headings out of the options, and each option keeps its Figma selection until the user selects', () => {
    expect(tsx).toContain('itemProps(0, false, "heading")');
    expect(tsx).toContain('itemProps(2, true, "item")');
    expect(tsx).toContain('itemProps(3, false, "separator")');
    expect(tsx).toContain("const on = selectedIndexes ? selectedIndexes.includes(i) : Boolean(figmaSelected);");
    // Your own items: their kind and selection come from their props.
    expect(tsx).toContain('kindOf((child.props as { contentType?: string }).contentType)');
    expect(tsx).toContain('selected?: number[];');
    expect(file(r, /stories\.tsx$/)).toContain("getByRole('listbox')");
  });

  it('does the same in the Web Components output, replacing the selection Figma bound on each copy', () => {
    const wc = wcGeneric(ctx(core.set) as never, 'OptionList', core, { prefix: 'ds', packageName: 'p' }, inst as never, (c) => `ds-${c.toLowerCase()}`);
    const el = wc.files.find((f) => /ds-optionlist\.ts$/.test(f.path) || (f.path.endsWith('.ts') && !f.path.endsWith('.stories.ts')))!.content;
    expect(el).toContain('role="option" id="item-2" aria-selected=${this.optionSelected(2, true)');
    expect(el.match(/\.isSelected=/g)?.length).toBe(3);
    expect(el).toContain('aria-hidden="true"');
    expect(el).toContain("aria-multiselectable=${this.selectionType === \"multi\" ? 'true' : nothing}");
    expect(el).toContain("this.addEventListener('keydown', this.moveActive);");
  });

  it('makes items without a selected axis, in a set named Menu, a WAI-ARIA menu', () => {
    const plain: FigmaNode = { ...optionNode, id: 'M:1', name: '_Menu Item', componentPropertyDefinitions: { 'title#1:0': { type: 'TEXT', defaultValue: 'Option' } }, children: [{ ...optionNode.children![0]!, id: 'M:2', name: 'Default' }] };
    const set = build(plain);
    const mreg = new Map<string, RegistryEntry>([['M:2', { component: 'MenuItem', importPath: '../MenuItem/MenuItem', kind: 'generic', set }]]);
    const mlook = (x: string) => mreg.get(x);
    const m = genericTemplate(ctx(build(listOf('MN:1', 'Menu', ['M:2', 'M:2', 'M:2']), { 'M:2': 'Default' })), 'Menu', { title: 'Menu', lookup: mlook, instance: ((part: { instanceComponentId?: string }) => { const e = part.instanceComponentId ? mreg.get(part.instanceComponentId) : undefined; return e ? instanceRef(e, part as never, new Map(), mlook) : undefined; }) as never });
    const mtsx = file(m, /Menu\.tsx$/);
    expect(mtsx).toContain("{ role: 'menu', tabIndex: 0,");
    expect(mtsx).toContain("role: 'menuitem'");
    expect(file(m, /stories\.tsx$/)).toContain("getByRole('menu')");
  });

  it('drops the role where Figma shows no items, and marks loading busy', () => {
    const variant = (vid: string, state: string, shown: boolean): FigmaNode => ({ id: vid, name: `state=${state}`, type: 'COMPONENT', layoutMode: 'VERTICAL', absoluteBoundingBox: box(200, 100), children: shown ? [0, 1].map((k) => ({ id: `${vid}i${k}`, name: 'item', type: 'INSTANCE' as const, componentId: id(0, false), absoluteBoundingBox: box(200, 32), children: [] })) : [{ id: `${vid}t`, name: 'message', type: 'TEXT' as const, characters: '…', absoluteBoundingBox: box(100, 20) }] });
    const node: FigmaNode = { id: 'LS:1', name: 'Option List', type: 'COMPONENT_SET', componentPropertyDefinitions: { state: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Loading', 'Empty'] } }, children: [variant('LS:2', 'Default', true), variant('LS:3', 'Loading', false), variant('LS:4', 'Empty', false)] };
    const lr = genericTemplate(ctx(build(node, names)), 'OptionList', { title: 'OptionList', lookup: look, instance: inst as never });
    const ltsx = file(lr, /OptionList\.tsx$/);
    expect(ltsx).toContain('const listed = !["loading","empty"].includes(String(state));');
    expect(ltsx).toContain(": { onKeyDown, 'aria-busy': state === \"loading\" || undefined };");
    const lcore = lr.core as GenericCore;
    const el = wcGeneric(ctx(lcore.set) as never, 'OptionList', lcore, { prefix: 'ds', packageName: 'p' }, inst as never, (c) => `ds-${c.toLowerCase()}`).files.find((f) => f.path.endsWith('.ts') && !f.path.endsWith('.stories.ts'))!.content;
    expect(el).toContain("role=${![\"loading\",\"empty\"].includes(String(this.state)) ? \"listbox\" : nothing}");
    expect(el).toContain('aria-busy=${this.state === "loading" ? \'true\' : nothing}');
  });

  it('leaves selectable items in sets named otherwise alone', () => {
    const preg = new Map<string, RegistryEntry>(options.variants.map((v) => [v.nodeId, { component: 'PageItem', importPath: '../PageItem/PageItem', kind: 'generic', set: options }]));
    const plook = (x: string) => preg.get(x);
    const pinst = (part: { instanceComponentId?: string }) => { const e = part.instanceComponentId ? preg.get(part.instanceComponentId) : undefined; return e ? instanceRef(e, part as never, new Map(), plook) : undefined; };
    const other = genericTemplate(ctx(build(listOf('X:1', 'Pagination', [id(0, false), id(0, true)]), names)), 'Pagination', { title: 'Pagination', lookup: plook, instance: pinst as never });
    expect((other.core as GenericCore).collection).toBeUndefined();
  });
});

// A select: State=Default/Opened, a label header, a field, and the list as a popup shown when opened.
const headerNode: FigmaNode = { id: 'H:1', name: 'Form Header', type: 'COMPONENT_SET', componentPropertyDefinitions: {}, children: [{ id: 'H:2', name: 'Default', type: 'COMPONENT', absoluteBoundingBox: box(100, 20), children: [{ id: 'H:2t', name: 'text', type: 'TEXT', characters: 'Label', absoluteBoundingBox: box(40, 20) }] }] };
const listSet = build(listOf('L:9', 'Option List', [id(0, false), id(0, false)]), names);
const selectVariant = (vid: string, open: boolean): FigmaNode => ({
  id: vid, name: `state=${open ? 'Opened' : 'Default'}`, type: 'COMPONENT', layoutMode: 'VERTICAL', absoluteBoundingBox: box(240, open ? 200 : 60), children: [
    { id: `${vid}h`, name: 'header', type: 'INSTANCE', componentId: 'H:2', componentPropertyReferences: { visible: 'showLabel#1:0' }, absoluteBoundingBox: box(100, 20), children: [] },
    { id: `${vid}f`, name: 'field', type: 'FRAME', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(240, 36), children: [{ id: `${vid}ft`, name: 'placeholder', type: 'TEXT', characters: 'Choose', absoluteBoundingBox: box(80, 20) }] },
    ...(open ? [{ id: `${vid}p`, name: 'Dropdown Menu', type: 'INSTANCE' as const, componentId: 'L:9v', absoluteBoundingBox: box(240, 140), children: [] }] : []),
  ],
});
const selectNode: FigmaNode = {
  id: 'SE:1', name: 'Select Input', type: 'COMPONENT_SET',
  componentPropertyDefinitions: { state: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Opened'] }, 'showLabel#1:0': { type: 'BOOLEAN', defaultValue: true } },
  children: [selectVariant('SE:2', false), selectVariant('SE:3', true)],
};

describe('select-only combobox', () => {
  const header = build(headerNode);
  const creg = new Map<string, RegistryEntry>([['H:2', { component: 'FormHeader', importPath: '../FormHeader/FormHeader', kind: 'generic', set: header }], ['L:9v', { component: 'OptionList', importPath: '../OptionList/OptionList', kind: 'generic', set: listSet }], ...reg]);
  const clook = (x: string) => creg.get(x);
  const cinst = (part: { instanceComponentId?: string }) => { const e = part.instanceComponentId ? creg.get(part.instanceComponentId) : undefined; return e ? instanceRef(e, part as never, new Map(), clook) : undefined; };
  const r = genericTemplate(ctx(build(selectNode, { 'H:2': 'Default', 'L:9v': 'Default' })), 'SelectInput', { title: 'SelectInput', behavior: 'combobox', lookup: clook, instance: cinst as never });
  const tsx = file(r, /SelectInput\.tsx$/);

  it('makes the field a combobox that controls the popup, named by the visible label', () => {
    expect(tsx).toContain('<div {...comboboxProps} className={styles.field}>');
    expect(tsx).toMatch(/<span id=\{popupId\} className=\{styles\.dropdownMenu\}>/);
    expect(tsx).toMatch(/<span id=\{labelId\} className=\{styles\.header\}>/);
    expect(tsx).toContain("'aria-labelledby': showLabel ? labelId : undefined, 'aria-label': showLabel ? undefined : ariaLabel ?? \"Select input\"");
    expect(tsx).toContain('role: "combobox"');
    expect(tsx).toContain("'aria-haspopup': \"listbox\" as const");
  });

  it('opens from the Figma open value, or from the user, and closes on Escape', () => {
    expect(tsx).toContain('const [innerOpen, setInnerOpen] = useState(defaultOpen ?? stateProp === "opened");');
    expect(tsx).toContain('const state = isOpen ? "opened" : stateProp === "opened" ? "default" : stateProp;');
    expect(tsx).toContain('data-state={state}');
    expect(tsx).toContain('onKeyDown={closeOnEscape}');
    expect(tsx).toContain('onOpenChange?: (open: boolean) => void;');
    expect(file(r, /stories\.tsx$/)).toContain("name: 'Opens and closes'");
    expect(r.report.gaps.join(' ')).toMatch(/typing to filter \(autocomplete\) is not generated/);
  });

  it('does the same in the Web Components output, with the open value on the state property', () => {
    const core = r.core as GenericCore;
    const wc = wcGeneric(ctx(core.set) as never, 'SelectInput', core, { prefix: 'ds', packageName: 'p' }, cinst as never, (c) => `ds-${c.toLowerCase()}`);
    const el = wc.files.find((f) => f.path.endsWith('.ts') && !f.path.endsWith('.stories.ts'))!.content;
    expect(el).toContain('<div id="combobox" role="combobox"');
    expect(el).toContain('aria-controls="popup"');
    expect(el).toContain("this.state = next ? \"opened\" : \"default\";");
    expect(el).toContain("this.addEventListener('keydown', this.closeOnEscape);");
  });

  it('makes the field a menu button when the popup holds actions rather than selectable options', () => {
    const plain = build({ ...headerNode, id: 'MI:1', name: 'Menu Item', children: [{ ...headerNode.children![0]!, id: 'MI:2' }] });
    const menuSet = build(listOf('MN:9', 'Menu', ['MI:2', 'MI:2']), { 'MI:2': 'Default' });
    const mreg = new Map<string, RegistryEntry>([['H:2', creg.get('H:2')!], ['L:9v', { component: 'Menu', importPath: '../Menu/Menu', kind: 'generic', set: menuSet }], ['MI:2', { component: 'MenuItem', importPath: '../MenuItem/MenuItem', kind: 'generic', set: plain }]]);
    const mlook = (x: string) => mreg.get(x);
    const m = genericTemplate(ctx(build(selectNode, { 'H:2': 'Default', 'L:9v': 'Default' })), 'SelectInput', { title: 'SelectInput', behavior: 'combobox', lookup: mlook, instance: ((part: { instanceComponentId?: string }) => { const e = part.instanceComponentId ? mreg.get(part.instanceComponentId) : undefined; return e ? instanceRef(e, part as never, new Map(), mlook) : undefined; }) as never });
    const mtsx = file(m, /SelectInput\.tsx$/);
    expect(mtsx).toContain('role: "button"');
    expect(mtsx).toContain("'aria-haspopup': \"menu\" as const");
    expect(m.report.gaps.join(' ')).not.toMatch(/typing to filter/);
  });

  it('is recognised in discovery from the open value and the popup', async () => {
    const page: FigmaNode = { id: '0:1', name: 'Inputs', type: 'CANVAS', children: [{ id: '1:1', name: 'Select', type: 'FRAME', children: [selectNode] }] } as FigmaNode;
    const byId = new Map<string, FigmaNode>();
    const index = (n: FigmaNode) => { byId.set(n.id, n); (n.children ?? []).forEach(index); };
    index(page);
    const client: FigmaReader = {
      file: async () => ({ name: 'F', version: '1', lastModified: '', document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [page] }, componentSets: {} }) as never,
      nodes: async (_k, ids) => ({ nodes: Object.fromEntries(ids.map((x) => [x, { document: byId.get(x)! }])) }) as never,
      fileWithIds: async () => { throw new Error('not used'); },
      localVariables: async () => { throw new Error('not used'); },
    };
    const d = await discover(client, 'F');
    const p = d.proposals.find((x) => x.name === 'SelectInput');
    expect(p?.template).toBe('combobox');
    expect(p?.reason).toMatch(/state opens the "Dropdown Menu" popup/);
  });
});
