import { describe, expect, it } from 'vitest';

import type { FigmaNode } from '../src/figma/types.ts';
import { genericTemplate, type RegistryEntry } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { buildComponentSet } from '../src/ir/build.ts';

const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const ctx = (set: ReturnType<typeof buildComponentSet>) => ({ fileKey: 'F', version: '1', sets: { main: set }, resolver: new TokenResolver(loadTokens({ variables: {} })), icons: new Map() });
const build = (node: FigmaNode) => buildComponentSet({ target: { id: node.id, archetype: 'generic', figma: { page: 'p', componentSet: { id: node.id, name: node.name } } }, set: node, docFrames: [], componentNames: { 'I:1': 'Button' }, resolve: () => undefined });
const file = (r: ReturnType<typeof genericTemplate>, re: RegExp) => r.files.find((f) => re.test(f.path))!.content;

describe('accessible names and nesting', () => {
  it('names a button by its label text where a variant hides the label (icon-only)', () => {
    // Carbon's Button: Type = Text / Icon only; the label layer is hidden in the icon-only variant.
    const node: FigmaNode = {
      id: 'B:1', name: 'Button', type: 'COMPONENT_SET',
      componentPropertyDefinitions: { Type: { type: 'VARIANT', defaultValue: 'Text', variantOptions: ['Text', 'Icon only'] }, 'Label#1:0': { type: 'TEXT', defaultValue: 'Save' } },
      children: ['Text', 'Icon only'].map((v, i) => ({
        id: `B:${i + 2}`, name: `Type=${v}`, type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(80, 32),
        children: [{ id: `B:${i + 2}t`, name: 'Label', type: 'TEXT', characters: 'Save', visible: v === 'Text', componentPropertyReferences: { characters: 'Label#1:0' }, absoluteBoundingBox: box(40, 16) }],
      })),
    };
    const r = genericTemplate(ctx(build(node)) as never, 'Button', { title: 'Button', instance: () => undefined, behavior: 'button' });
    const tsx = file(r, /Button\.tsx$/);
    expect(tsx).toMatch(/<button type="button"[^>]*aria-label=\{typeof label === 'string' \? label : undefined\}[^>]*\{\.\.\.rest\}>/);
    expect(r.report.assumptions.join(' ')).toMatch(/named by its label text/);
  });

  it('does not make a component a button when it contains other controls', () => {
    // Carbon's ComboButton: named a button, but it holds two Button instances.
    const node: FigmaNode = {
      id: 'C:1', name: 'Combo button', type: 'COMPONENT_SET',
      componentPropertyDefinitions: { Size: { type: 'VARIANT', defaultValue: 'Large', variantOptions: ['Large'] } },
      children: [{ id: 'C:2', name: 'Size=Large', type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(160, 40), children: [
        { id: 'C:3', name: 'Primary', type: 'INSTANCE', componentId: 'I:1', absoluteBoundingBox: box(120, 40), children: [] },
        { id: 'C:4', name: 'Menu', type: 'INSTANCE', componentId: 'I:1', absoluteBoundingBox: box(40, 40), children: [] },
      ] }],
    };
    const button = { component: 'Button', importPath: '../Button/Button', kind: 'button', set: build({ id: 'X:1', name: 'Button', type: 'COMPONENT_SET', children: [] }) } as RegistryEntry;
    const r = genericTemplate(ctx(build(node)) as never, 'ComboButton', {
      title: 'ComboButton', behavior: 'button', lookup: (id) => (id === 'I:1' ? button : undefined),
      instance: () => ({ component: 'Button', importPath: '../Button/Button', attrs: [], props: [], usesIcon: false, notes: [], kind: 'button' }),
    });
    const tsx = file(r, /ComboButton\.tsx$/);
    expect(tsx).not.toMatch(/<button/);
    expect(tsx).toContain('<Button');
    expect(r.report.gaps.join(' ')).toMatch(/contains other controls \(Button\), so it is not itself a button/);
  });
});
