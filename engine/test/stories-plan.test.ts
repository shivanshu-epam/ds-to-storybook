import { describe, expect, it } from 'vitest';

import type { FigmaNode } from '../src/figma/types.ts';
import { genericTemplate } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { buildComponentSet } from '../src/ir/build.ts';

const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const ctx = (set: ReturnType<typeof buildComponentSet>) => ({ fileKey: 'F', version: '1', sets: { main: set }, resolver: new TokenResolver(loadTokens({ variables: {} })), icons: new Map() });
const build = (node: FigmaNode) => buildComponentSet({ target: { id: node.id, archetype: 'generic', figma: { page: 'p', componentSet: { id: node.id, name: node.name } } }, set: node, docFrames: [], componentNames: {}, resolve: () => undefined });

// Carbon-like Button: Style (the main appearance property) and State (with a non-pseudo Skeleton value).
const styles = ['Primary', 'Secondary', 'Error'];
const states = ['Enabled', 'Hover', 'Disabled', 'Skeleton'];
const node: FigmaNode = {
  id: 'B:1', name: 'Button', type: 'COMPONENT_SET',
  componentPropertyDefinitions: {
    Style: { type: 'VARIANT', defaultValue: 'Primary', variantOptions: styles },
    State: { type: 'VARIANT', defaultValue: 'Enabled', variantOptions: states },
    'Label#1:0': { type: 'TEXT', defaultValue: 'Save' },
  },
  children: styles.flatMap((st) => states.map((s, i) => ({
    id: `B:${st}${i}`, name: `Style=${st}, State=${s}`, type: 'COMPONENT' as const, layoutMode: 'HORIZONTAL' as const, absoluteBoundingBox: box(80, 32),
    children: [{ id: `B:${st}${i}t`, name: 'Label', type: 'TEXT' as const, characters: 'Save', componentPropertyReferences: { characters: 'Label#1:0' }, absoluteBoundingBox: box(40, 16) }],
  }))),
};

describe('stories from the reference spec', () => {
  const r = genericTemplate(ctx(build(node)) as never, 'Button', { title: 'Button', instance: () => undefined, behavior: 'button' });
  const stories = r.files.find((f) => f.path.endsWith('.stories.tsx'))!.content;

  it('writes one story per value of the main appearance property, except the default', () => {
    expect(stories).toMatch(/export const Secondary: Story = \{\n  name: 'Secondary',\n  args: \{ style\w*: 'secondary' \},/);
    expect(stories).not.toMatch(/export const Primary: Story/);
  });

  it('never shadows a JavaScript global with a story export', () => {
    expect(stories).toMatch(/export const ErrorStory: Story = \{\n  name: 'Error',/);
    expect(stories).not.toMatch(/export const Error: Story/);
  });

  it('writes one story per state a prop sets, and logs clicks in the Actions panel', () => {
    expect(stories).toMatch(/export const Disabled: Story = \{\n  name: 'Disabled',\n  args: \{ disabled: true \},/);
    expect(stories).toMatch(/export const Skeleton: Story = \{\n  name: 'Skeleton',\n  args: \{ state: 'skeleton' \},/);
    expect(stories).not.toMatch(/export const Hover: Story/);
    expect(stories).toMatch(/^  args: \{ onClick: fn\(\) \},$/m);
  });
});
