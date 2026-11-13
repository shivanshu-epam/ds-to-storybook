import { describe, expect, it } from 'vitest';

import { genericTemplate, type GenericCore } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { tagFor, wcGeneric } from '../src/generate/wc/components.ts';
import { buildComponentSet } from '../src/ir/build.ts';
import type { FigmaNode } from '../src/figma/types.ts';

const text = (id: string, name: string, characters: string, refs: Record<string, string>): FigmaNode => ({ id, name, type: 'TEXT', characters, componentPropertyReferences: refs, absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 16 } }) as FigmaNode;
const variant = (id: string, name: string, color: number): FigmaNode => ({
  id,
  name,
  type: 'COMPONENT',
  layoutMode: 'VERTICAL',
  absoluteBoundingBox: { x: 0, y: 0, width: 240, height: 80 },
  children: [
    text(`${id}a`, 'label', 'Email', { characters: 'Label#1:0' }),
    { id: `${id}b`, name: 'container', type: 'FRAME', layoutMode: 'HORIZONTAL', fills: [{ type: 'SOLID', color: { r: color, g: 1, b: 1, a: 1 } }], children: [text(`${id}c`, 'value', 'you@example.com', { characters: 'Placeholder#2:0' })] } as FigmaNode,
    text(`${id}d`, 'helper', 'We reply within a day.', { characters: 'Helper text#3:0' }),
  ],
});
const node: FigmaNode = {
  id: '9:1',
  name: 'Input',
  type: 'COMPONENT_SET',
  componentPropertyDefinitions: {
    'Label#1:0': { type: 'TEXT', defaultValue: 'Email' },
    'Placeholder#2:0': { type: 'TEXT', defaultValue: 'you@example.com' },
    'Helper text#3:0': { type: 'TEXT', defaultValue: 'We reply within a day.' },
    Type: { type: 'VARIANT', defaultValue: 'Outlined', variantOptions: ['Outlined', 'Filled'] },
    State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Focus', 'Error'] },
  },
  children: [variant('9:2', 'Type=Outlined, State=Default', 1), variant('9:3', 'Type=Filled, State=Default', 0.9), variant('9:4', 'Type=Outlined, State=Error', 0.5)],
};
const set = buildComponentSet({ target: { id: 'i', archetype: 'input', figma: { page: 'p', componentSet: { id: '9:1', name: 'Input' } } }, set: node, docFrames: [], componentNames: {}, resolve: () => undefined });
const tokens = loadTokens({ variables: { 'semantic.color': [['text/primary', 'C', { light: '#111111' }, 'var(--text-primary)']] } });
const ctx = { fileKey: 'F', version: '1', sets: { main: set }, resolver: new TokenResolver(tokens), icons: new Map() };
const react = genericTemplate(ctx, 'Input', { title: 'Components/Input', instance: () => undefined, behavior: 'input' });
const core = react.core as GenericCore;
const file = (files: { path: string; content: string }[], end: string) => files.find((f) => f.path.endsWith(end))!.content;

describe('input template', () => {
  it('finds the layers by the Figma properties bound to them', () => {
    expect(core.input).toMatchObject({ value: 'value', label: 'label', helper: 'helper', valueColor: 'var(--text-primary)', renamed: { from: 'type', to: 'appearance' } });
  });

  it('renders a native input with its label, description and validity', () => {
    const tsx = file(react.files, 'Input.tsx');
    expect(tsx).toContain('<label className={styles.label} htmlFor={inputId}>{label}</label>');
    expect(tsx).toContain('placeholder={placeholder}');
    expect(tsx).toContain('aria-describedby={describedBy}');
    expect(tsx).toContain("const invalid = Boolean(invalidProp) || state === 'error';");
    // Figma Type is "appearance"; "type" stays the native input type.
    expect(tsx).toContain("appearance = 'outlined'");
    expect(tsx).toContain('data-type={appearance}');
    expect(file(react.files, 'Input.module.css')).toContain('.root .value:not(:placeholder-shown) { color: var(--text-primary); }');
    expect(file(react.files, 'Input.stories.tsx')).toContain("toHaveAccessibleDescription('We reply within a day.')");
  });

  it('Web Component: form-associated, with the input and label in one shadow root', () => {
    const wc = wcGeneric(ctx, 'Input', core, { prefix: 'ds', packageName: 'p' }, () => undefined, (n) => tagFor('ds', n));
    const el = file(wc.files, 'ds-input.ts');
    expect(el).toContain('static formAssociated = true;');
    expect(el).toContain('<label class="label" for="input">');
    expect(el).toContain('<input id="input" class="value"');
    expect(el).toContain('this.internals.setValidity(input.validity, input.validationMessage, input);');
    expect(file(wc.files, 'Input.css')).toBe(file(react.files, 'Input.module.css'));
  });
});
