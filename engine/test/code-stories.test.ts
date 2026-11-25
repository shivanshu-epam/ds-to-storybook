import { describe, expect, it } from 'vitest';

import { readComponentApis, moduleExports } from '../src/code/api.ts';
import { mapComponent } from '../src/code/map.ts';
import { codeStories } from '../src/generate/code/stories.ts';
import type { IRComponentSet } from '../src/ir/types.ts';

const src = { from: './test/fixtures/code-lib/index.ts', root: '.' };
const exportsList = moduleExports(src);
const apis = readComponentApis(src, ['Button']);
const variant = (id: string, values: Record<string, string>) => ({ nodeId: id, name: Object.entries(values).map(([k, v]) => `${k}=${v}`).join(', '), values, style: { width: 80 } as never, parts: [] });
const set: IRComponentSet = {
  targetId: 'B', nodeId: 'B:1', name: 'Button', description: 'Buttons start actions.', page: 'p', notes: [], hash: '', docFrames: [],
  properties: [
    { name: 'Style', rawName: 'Style', type: 'VARIANT', default: 'Primary', options: ['Primary', 'Secondary'] },
    { name: 'State', rawName: 'State', type: 'VARIANT', default: 'Enabled', options: ['Enabled', 'Hover', 'Skeleton'] },
    { name: 'Button text', rawName: 'Button text#1', type: 'TEXT', default: 'Save' },
  ],
  variants: [variant('V:1', { Style: 'Primary', State: 'Enabled' }), variant('V:2', { Style: 'Secondary', State: 'Hover' }), variant('V:3', { Style: 'Primary', State: 'Skeleton' })],
};

describe('code mode: stories of the real component', () => {
  const entry = mapComponent('Button', [set], apis.get('Button')!, exportsList);
  const r = codeStories({ name: 'Button', title: 'Components/Button', from: '@acme/ui', sets: [set], entry, api: apis.get('Button')!, fileKey: 'F', parent: 'Toolbar', examples: { size: 'md' } });
  const tsx = r.files[0]!.content;
  const mdx = r.files[1]!.content;

  it('imports the real component and sets it up from Figma through the map', () => {
    expect(tsx).toContain("import { Button, ButtonSkeleton, Toolbar } from '@acme/ui';");
    expect(tsx).toContain("  args: { kind: 'primary', children: 'Save', size: 'md' },");
    expect(tsx).toMatch(/export const Secondary: Story = \{\n  name: 'Secondary',\n  args: \{ kind: 'secondary' \},\n  decorators: \[inParent\],/);
    expect(tsx).toMatch(/    children: \{ control: [^,]+, description: 'Figma: Button text\.' \},/);
    expect(tsx).toMatch(/kind: \{ control: 'inline-radio', options: \['primary', 'secondary', 'danger--primary', 'ghost'\], description: 'Figma: Style\. The kind of button\.' \}/);
  });

  it('shows states the way code sets them: a skeleton component, and hover by interaction', () => {
    expect(tsx).toContain("<Labelled label='Skeleton'><ToolbarStory><ButtonSkeletonStory /></ToolbarStory></Labelled>");
    expect(tsx).toContain('Hover: real interactions on the component');
    expect(r.interactive).toEqual({ values: { State: ['Hover'] }, variants: ['V:2'] });
    expect(tsx).toMatch(/data-figma-variant='V:1'/);
    expect(tsx).not.toMatch(/data-figma-variant='V:2'/);
  });

  it('writes a docs page with the Figma-to-code table and code-only props', () => {
    expect(mdx).toContain('<Title>Button</Title>');
    expect(mdx).toContain('Buttons start actions.');
    expect(mdx).toMatch(/## Figma to code[\s\S]*Style[\s\S]*kind/);
    expect(mdx).toMatch(/### Only in code/);
  });
});
