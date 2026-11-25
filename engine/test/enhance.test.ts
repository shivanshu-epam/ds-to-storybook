import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CodeMapEntry } from '../src/code/map.ts';
import { enhance } from '../src/enhance/enhance.ts';
import { findStoryFiles, readStoriesFile } from '../src/enhance/existing.ts';
import type { IRComponentSet } from '../src/ir/types.ts';

// The team's own stories, in the style Carbon writes them: shared argTypes spread in, function stories with .args.
const STORIES = `import React from 'react';
import { default as Button, ButtonSkeleton } from '../Button';

const shared = { kind: { options: ['primary', 'secondary', 'danger'], control: { type: 'select' } }, size: { options: ['sm', 'md', 'lg'] }, disabled: {} };

export default { title: 'Components/Button', component: Button, argTypes: shared, args: { children: 'Button' } };

export const Default = (args) => <Button {...args}>Button</Button>;
export const Secondary = (args) => <Button {...args} />;
Secondary.args = { kind: 'secondary' };
export const Ghost = { render: () => <Button kind="ghost">Go</Button> };
export const Skeleton = () => <ButtonSkeleton />;
export const helper = { not: 'a story' };
`;

const set: IRComponentSet = {
  targetId: 'B', nodeId: 'B:1', name: 'Button', description: '', page: 'p', notes: [], hash: '', docFrames: [], variants: [],
  properties: [
    { name: 'Style', rawName: 'Style', type: 'VARIANT', default: 'Primary', options: ['Primary', 'Secondary', 'Ghost', 'Danger'] },
    { name: 'Size', rawName: 'Size', type: 'VARIANT', default: 'Large', options: ['Small', 'Large', 'Huge'] },
    { name: 'State', rawName: 'State', type: 'VARIANT', default: 'Enabled', options: ['Enabled', 'Hover', 'Disabled', 'Skeleton', 'Loading'] },
    { name: 'Label', rawName: 'Label#1', type: 'TEXT', default: 'Save' },
  ],
};
const entry: CodeMapEntry = {
  component: 'Button', export: 'Button', found: true, codeOnly: [], conflicts: [],
  mappings: [
    { figma: 'Style', figmaType: 'VARIANT', code: 'kind', shape: 'enum', confidence: 'high', reason: '', values: { Primary: { value: 'primary' }, Secondary: { value: 'secondary' }, Ghost: { value: 'ghost' }, Danger: { value: 'danger' } } },
    { figma: 'Size', figmaType: 'VARIANT', code: 'size', shape: 'enum', confidence: 'high', reason: '', values: { Small: { value: 'sm' }, Large: { value: 'lg' }, Huge: null } },
    { figma: 'State', figmaType: 'VARIANT', shape: 'state', confidence: 'medium', reason: '', values: { Enabled: { value: 'base' }, Hover: { css: 'hover' }, Disabled: { prop: 'disabled', value: true }, Skeleton: { component: 'ButtonSkeleton' }, Loading: { prop: 'loading', value: true } } },
    { figma: 'Label', figmaType: 'TEXT', code: 'children', shape: 'children', confidence: 'medium', reason: '' },
  ],
};

describe('enhance mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'enhance-'));
  mkdirSync(join(root, 'Button'));
  writeFileSync(join(root, 'Button', 'Button.stories.js'), STORIES);
  writeFileSync(join(root, 'Button', 'Button.figma.stories.jsx'), '// ours, skipped');

  it('reads the team\'s stories: title, component, args, controls and what each renders', () => {
    expect(findStoryFiles(root).map((f) => f.slice(root.length + 1))).toEqual(['Button/Button.stories.js']);
    const f = readStoriesFile(join(root, 'Button', 'Button.stories.js'), root);
    expect(f).toMatchObject({ file: 'Button/Button.stories.js', title: 'Components/Button', component: 'Button', args: { children: 'Button' } });
    expect(f.imports.Button).toEqual({ from: '../Button', imported: 'default' });
    expect(f.argTypes).toEqual({ kind: ['primary', 'secondary', 'danger'], size: ['sm', 'md', 'lg'], disabled: [] });
    expect(f.stories.map((s) => s.export)).toEqual(['Default', 'Secondary', 'Ghost', 'Skeleton']);
    expect(f.stories.find((s) => s.export === 'Secondary')!.args).toEqual({ kind: 'secondary' });
    expect(f.stories.find((s) => s.export === 'Ghost')!.renders).toEqual([{ tag: 'Button', attrs: { kind: 'ghost' } }]);
  });

  it('checks every Figma value against them and adds only what is missing, next to their file', () => {
    const existing = findStoryFiles(root).map((f) => readStoriesFile(f, root));
    const res = enhance({ existing, root, from: '@acme/ui', components: [{ name: 'Button', sets: [set], entry, api: { export: 'Button', found: true, props: [], inherited: [], accepts: { children: true } } }] });
    const status = Object.fromEntries(res.components[0]!.items.map((i) => [`${i.figma}=${i.value}`, i.status]));
    expect(status).toEqual({
      'Style=Primary': 'shown', 'Style=Secondary': 'shown', 'Style=Ghost': 'shown', 'Style=Danger': 'control',
      'Size=Small': 'control', 'Size=Large': 'shown', 'Size=Huge': 'no-code',
      'State=Enabled': 'shown', 'State=Hover': 'interactive', 'State=Disabled': 'control', 'State=Skeleton': 'shown', 'State=Loading': 'missing',
    });
    expect(res.files.map((f) => f.path)).toEqual(['Button/Button.figma.stories.jsx']);
    const file = res.files[0]!.content;
    expect(file).toContain('import { default as Button } from "../Button";');
    expect(file).toContain('title: "Components/Button/Figma coverage",');
    expect(file).toContain('args: {"children":"Save"},');
    expect(file).toContain('export const Danger = {\n  name: "Danger",\n  args: {"kind":"danger"},');
    expect(file).toContain('export const Loading = {\n  name: "Loading",\n  args: {"loading":true},');
    expect(file).not.toMatch(/export const (Secondary|Ghost|Skeleton|Huge)\b/);
    expect(res.report).toContain('| Style=Danger | `kind=danger` | control only |');
    expect(res.report).toContain('| Size=Huge | `—` | not in code |');
  });
});
