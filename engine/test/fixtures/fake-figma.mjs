// A fake Figma file and `figma` API for testing plugin/code.js outside Figma: a component set, an icon, an instance of a
// broken component set (its properties throw Figma's error), and a doc page made of instances.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export async function runPlugin(codeUrl) {
  const mixed = Symbol('mixed');
  const posted = [];
  let onmessage;
  const solid = (r, g, b) => ({ type: 'SOLID', visible: true, opacity: 1, blendMode: 'NORMAL', color: { r, g, b } });
  const base = (id, name, type, extra = {}) => ({
    id, name, type, visible: true, opacity: 1, rotation: 0, absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 }, absoluteRenderBounds: { x: 0, y: 0, width: 24, height: 24 },
    fills: [], strokes: [], strokeWeight: 1, strokeAlign: 'INSIDE', dashPattern: [], effects: [], cornerRadius: 0, layoutMode: 'NONE', constraints: { horizontal: 'MIN', vertical: 'MIN' },
    exportAsync: async ({ format }) => new Uint8Array(format === 'SVG' ? [60, 115, 118, 103, 47, 62] : [137, 80, 78, 71]),
    ...extra,
  });
  const text = (id, chars) => base(id, 'Label', 'TEXT', {
    characters: chars, textAlignHorizontal: 'LEFT', fills: mixed,
    getStyledTextSegments: () => [{ fontName: { family: 'IBM Plex Sans', style: 'Regular' }, fontSize: 14, fontWeight: 400, letterSpacing: { unit: 'PERCENT', value: 1 }, lineHeight: { unit: 'PIXELS', value: 18 }, textCase: 'ORIGINAL', textDecoration: 'NONE', fills: [solid(0, 0, 0)] }],
  });
  const icon = base('9:1', 'icons/add', 'COMPONENT', { key: 'kIcon', description: '', parent: { type: 'PAGE' }, children: [base('9:2', 'Vector', 'VECTOR')] });
  const variant = base('2:1', 'Size=Small', 'COMPONENT', { key: 'k1', description: '', layoutMode: 'HORIZONTAL', itemSpacing: 8, paddingLeft: 16, paddingRight: 16, paddingTop: 0, paddingBottom: 0, primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER', fills: [solid(0.06, 0.38, 1)] });
  const set = base('2:0', 'Button', 'COMPONENT_SET', { key: 'k0', description: 'Buttons', children: [variant], componentPropertyDefinitions: { 'Size': { type: 'VARIANT', defaultValue: 'Small', variantOptions: ['Small'] } } });
  variant.parent = set;
  // An instance inside the component: its contents matter. One child is an instance of a broken set.
  const iconInstance = base('I2:1;9:1', 'icon', 'INSTANCE', { getMainComponentAsync: async () => icon, componentProperties: {}, overrides: [], children: [base('I2:1;9:2', 'Vector', 'VECTOR')] });
  const broken = base('I2:1;5:5', 'broken', 'INSTANCE', { getMainComponentAsync: async () => null, overrides: [], children: [] });
  Object.defineProperty(broken, 'componentProperties', { get() { throw new Error('in get_componentProperties: Component set for node has existing errors'); } });
  variant.children = [iconInstance, text('2:5', 'Button'), broken];
  // A doc page made of instances: kept without their contents.
  const docInstance = base('7:1', 'Doc card', 'INSTANCE', { getMainComponentAsync: async () => variant, componentProperties: { 'Size': { type: 'VARIANT', value: 'Small' } }, overrides: [], children: [text('I7:1;2:5', 'Hidden inside')] });
  const page1 = { id: '1:0', name: 'Button', type: 'PAGE', loadAsync: async () => {}, children: [set, icon] };
  const page2 = { id: '6:0', name: 'Docs', type: 'PAGE', loadAsync: async () => {}, children: [docInstance] };
  const nodes = new Map([['2:1', variant], ['9:1', icon], ['9:2', icon.children[0]], ['I2:1;9:2', iconInstance.children[0]]]);

  const figma = {
    mixed, fileKey: 'CARBONKEY', root: { name: 'Carbon test', children: [page1, page2] },
    showUI() {}, closePlugin() {},
    ui: { postMessage: (m) => posted.push(m), set onmessage(f) { onmessage = f; } },
    loadAllPagesAsync: async () => { throw new Error('should load page by page'); },
    getNodeByIdAsync: async (id) => nodes.get(id) ?? null,
    getLocalPaintStylesAsync: async () => [{ id: 'S:p1,', key: 'p1', name: 'Brand/Blue', description: '', paints: [solid(0.06, 0.38, 1)] }],
    getLocalTextStylesAsync: async () => [{ id: 'S:t1,', key: 't1', name: 'Body/Regular', description: '', fontName: { family: 'IBM Plex Sans', style: 'SemiBold' }, fontSize: 14, lineHeight: { unit: 'PERCENT', value: 140 }, letterSpacing: { unit: 'PIXELS', value: 0 } }],
    getLocalEffectStylesAsync: async () => [],
    variables: { getLocalVariableCollectionsAsync: async () => [{ id: 'C:1', name: 'Theme', modes: [{ modeId: 'm1', name: 'White' }], defaultModeId: 'm1', variableIds: ['V:1'] }], getLocalVariablesAsync: async () => [{ id: 'V:1', name: 'background', variableCollectionId: 'C:1', resolvedType: 'COLOR', codeSyntax: {}, valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } }, scopes: ['ALL_SCOPES'] }] },
  };
  vm.runInNewContext(readFileSync(codeUrl, 'utf8'), { figma, __html__: '', setTimeout, console, Math, JSON, Object, Array, Set, Map, Promise, String, Error, Symbol, Uint8Array });
  await onmessage({ type: 'export', options: { renders: true, scale: 2 } });
  return posted;
}
