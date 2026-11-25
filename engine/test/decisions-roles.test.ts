import { afterEach, describe, expect, it } from 'vitest';

import { activeDecisions, setActiveDecisions, validateDecisions, type DecisionsFile } from '../src/decisions/decisions.ts';
import { checkSpecs } from '../src/docspec/check.ts';
import type { DocSpec } from '../src/docspec/types.ts';
import type { FigmaNode } from '../src/figma/types.ts';
import { analyzeAxes, genericTemplate } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { buildComponentSet } from '../src/ir/build.ts';

const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const node: FigmaNode = {
  id: 'B:1', name: 'Button', type: 'COMPONENT_SET',
  componentPropertyDefinitions: {
    Style: { type: 'VARIANT', defaultValue: 'Primary', variantOptions: ['Primary', 'Danger primary'] },
    'Resizer#1:0': { type: 'BOOLEAN', defaultValue: false },
    'Icon#2:0': { type: 'BOOLEAN', defaultValue: true },
  },
  children: ['Primary', 'Danger primary'].map((v, i) => ({ id: `B:${i + 2}`, name: `Style=${v}`, type: 'COMPONENT' as const, layoutMode: 'HORIZONTAL' as const, absoluteBoundingBox: box(80, 32), children: [] })),
};
const set = buildComponentSet({ target: { id: 'B:1', archetype: 'generic', figma: { page: 'p', componentSet: { id: 'B:1', name: 'Button' } } }, set: node, docFrames: [], componentNames: {}, resolve: () => undefined });
const ir = { components: [set] } as never;
const file = (props: DecisionsFile['sets'][string]['props']): DecisionsFile => ({ version: 1, sets: { Button: { status: 'accepted', props } } });

afterEach(() => setActiveDecisions(new Map()));

describe('decision roles: internal properties and value names', () => {
  it('validates values and roles against the Figma set', () => {
    const problems = validateDecisions(file({ Style: { values: { Primary: 'primary', Purple: 'x', 'Danger primary': 'primary' } }, Resizer: { role: 'hidden' as never, values: { a: 'b' } } }), ir).map((p) => `${p.prop}: ${p.message}`);
    expect(problems).toEqual(expect.arrayContaining([
      'Style: "Purple" is not a value of this Figma property.',
      'Style: Two Figma values have the same code value.',
      'Resizer: role must be "api" or "internal".',
      'Resizer: values apply to variant properties only.',
    ]));
    expect(validateDecisions(file({ Style: { values: { 'Danger primary': 'danger' } }, Resizer: { role: 'internal' } }), ir)).toEqual([]);
  });

  it('uses decided value names, and keeps internal properties out of controls and stories', () => {
    setActiveDecisions(activeDecisions(file({ Style: { name: 'kind', values: { 'Danger primary': 'danger' } }, Resizer: { role: 'internal' } }), 'accepted'));
    const style = analyzeAxes(set).find((a) => a.figma === 'Style')!;
    expect(style).toMatchObject({ prop: 'kind', options: ['primary', 'danger'] });
    const r = genericTemplate({ fileKey: 'F', version: '1', sets: { main: set }, resolver: new TokenResolver(loadTokens({ variables: {} })), icons: new Map() } as never, 'Button', { title: 'Button', instance: () => undefined });
    const stories = r.files.find((f) => f.path.endsWith('.stories.tsx'))!.content;
    expect(stories).toContain("resizer: { table: { disable: true }, description: 'Internal (Figma Resizer).' },");
    expect(stories).toContain("icon: { control: 'boolean'");
    expect(stories).not.toMatch(/label='Resizer: on'/);
    expect(stories).toMatch(/label='Icon: off'/);
    expect(stories).toContain("'Danger primary': { kind: 'danger' }");
  });
});

describe('documentation gate', () => {
  const spec = (component: string, items: string[]) => ({ component, coverage: { complete: items.length === 0 }, gaps: items.map((item) => ({ item, message: `gap ${item}` })) }) as unknown as DocSpec;

  it('fails on new gaps only, and reports closed ones', () => {
    const r = checkSpecs('storybook', [spec('Button', ['section:usage', 'Size=Huge']), spec('Tag', [])], { Button: ['section:usage'], Tag: ['description'], Gone: ['x'] });
    expect(r.added).toEqual([{ component: 'Button', item: 'Size=Huge', message: 'gap Size=Huge' }]);
    expect(r.known).toBe(1);
    expect(r.fixed).toEqual([{ component: 'Tag', item: 'description' }, { component: 'Gone', item: 'x' }]);
    expect(checkSpecs('storybook', [spec('Button', ['section:usage'])], {}).added).toHaveLength(1);
  });
});
