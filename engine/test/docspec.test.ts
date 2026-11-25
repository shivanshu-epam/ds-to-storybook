import { describe, expect, it } from 'vitest';

import { buildDocSpec, loadReferences, pickReference } from '../src/docspec/build.ts';
import type { IRComponentSet } from '../src/ir/types.ts';

const refs = loadReferences();
const set = (props: IRComponentSet['properties'], variants: string[]): IRComponentSet => ({
  targetId: 't', nodeId: 'S:1', name: 'Tag', description: 'A short label.', page: 'Tag', notes: [], hash: 'h', docFrames: [],
  properties: props,
  variants: variants.map((v, i) => ({ nodeId: `V:${i}`, name: `Kind=${v}`, values: { Kind: v }, style: {} as never, parts: [] })),
});
const report = { name: 'Tag', figmaSets: ['S:1'], files: [], props: [{ prop: 'kind', figma: 'Kind' }, { prop: 'label', figma: 'Label' }], assumptions: [], gaps: [], dependencies: {} };
const stories = (rows: string[], variants: string[]) => `const meta = {
  argTypes: {
    kind: { control: 'inline-radio', options: ['red', 'blue', 'green'], description: 'Figma: Kind' },
    label: { control: 'text', description: 'Figma: Label' },
  },
} satisfies Meta<typeof Tag>;

/** Figma default variant: Kind=Red. */
export const Default: Story = {};

/** Figma Kind. */
export const Kind: Story = {
  render: (args) => {
    const values: Record<string, Partial<TagProps>> = { ${rows.map((r) => `'${r}': { kind: '${r.toLowerCase()}' }`).join(', ')} };
    return <Row />;
  },
};

/** Every Figma variant once. */
export const FigmaVariants: Story = {
  tags: ['!dev', '!test', '!autodocs'],
  render: () => [${variants.map((v) => `{ id: '${v}' }`).join(', ')}],
};
`;
const mdx = '## Overview\n\n## Preview\n\n## Variants\n\n## Accessibility\n\n## Usage\n\n## Properties\n\n## Code\n';
const props: IRComponentSet['properties'] = [
  { name: 'Kind', rawName: 'Kind', type: 'VARIANT', default: 'Red', options: ['Red', 'Blue', 'Green'] },
  { name: 'Label', rawName: 'Label#1:0', type: 'TEXT', default: 'New' },
];
const spec = (s: string, m = mdx, p = props) => buildDocSpec({ name: 'Tag', title: 'Components/Tag', buildingBlock: false, sets: [set(p, ['Red', 'Blue', 'Green'])], fileKey: 'F', version: '1', report, stories: s, mdx: m, refs });

describe('component doc spec', () => {
  it('is complete when every property, value and variant is in Storybook', () => {
    const s = spec(stories(['Red', 'Blue', 'Green'], ['V:0', 'V:1', 'V:2']));
    expect(s.kind.id).toBe('badge');
    expect(s.coverage).toMatchObject({ properties: { total: 2, covered: 2 }, values: { total: 3, shown: 3, missing: 0 }, variants: { total: 3, rendered: 3 }, complete: true });
    expect(s.stories.map((x) => [x.export, x.visibility])).toEqual([['Default', 'dev'], ['Kind', 'dev'], ['FigmaVariants', 'test']]);
  });

  it('reports a value that is only a control, and a variant that is not rendered', () => {
    const s = spec(stories(['Red', 'Blue'], ['V:0', 'V:1']));
    expect(s.properties.find((p) => p.figma === 'Kind')!.values).toEqual([{ figma: 'Red', coverage: 'shown' }, { figma: 'Blue', coverage: 'shown' }, { figma: 'Green', coverage: 'control' }]);
    expect(s.coverage.complete).toBe(false);
    expect(s.gaps.map((g) => g.message).join(' ')).toMatch(/1 of 3 designed Figma variants are not rendered/);
  });

  it('reports a Figma property with no prop, control or story, and missing required sections', () => {
    const extra = [...props, { name: 'Dismissible', rawName: 'Dismissible#2:0', type: 'BOOLEAN' as const, default: false }];
    const s = spec(stories(['Red', 'Blue', 'Green'], ['V:0', 'V:1', 'V:2']), '## Overview\n\n## Code\n', extra);
    expect(s.properties.find((p) => p.figma === 'Dismissible')!.coverage).toBe('missing');
    expect(s.gaps.map((g) => g.item)).toEqual(expect.arrayContaining(['Dismissible', 'section:preview', 'section:usage', 'section:api']));
  });

  it('picks the kind from detected behaviour first, then the name, then the generic fallback', () => {
    expect(pickReference(refs, 'collection:tablist', ['Whatever']).ref.id).toBe('tabs');
    expect(pickReference(refs, undefined, ['Notification - Inline']).ref.id).toBe('notification');
    expect(pickReference(refs, undefined, ['IconButton']).ref.id).toBe('button');
    expect(pickReference(refs, undefined, ['Frobnicator'])).toMatchObject({ from: 'fallback', ref: { id: 'component' } });
  });
});
