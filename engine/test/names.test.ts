import { describe, expect, it } from 'vitest';

import { validateDecisions } from '../src/decisions/decisions.ts';
import type { FigmaNode } from '../src/figma/types.ts';
import { uniqueIcons } from '../src/generate/icons.ts';
import { propPlan } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { wcProp } from '../src/generate/wc/components.ts';
import { buildComponentSet } from '../src/ir/build.ts';

const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
// Carbon's Menu: a variant called "Function", and booleans called "Delete" and "default".
const node: FigmaNode = {
  id: 'M:1', name: 'Menu', type: 'COMPONENT_SET',
  componentPropertyDefinitions: {
    Function: { type: 'VARIANT', defaultValue: 'Simple', variantOptions: ['Simple', 'Advanced'] },
    'Delete#1:0': { type: 'BOOLEAN', defaultValue: true },
    'default#2:0': { type: 'BOOLEAN', defaultValue: false },
  },
  children: ['Simple', 'Advanced'].map((v, i) => ({ id: `M:${i + 2}`, name: `Function=${v}`, type: 'COMPONENT', absoluteBoundingBox: box(120, 40), children: [] })),
};
const set = buildComponentSet({ target: { id: 'M:1', archetype: 'generic', figma: { page: 'p', componentSet: { id: 'M:1', name: 'Menu' } } }, set: node, docFrames: [], componentNames: {}, resolve: () => undefined });

describe('names that would not be valid code', () => {
  it('never names a prop with a JavaScript reserved word', () => {
    const plan = propPlan(set);
    expect(plan.axes.map((a) => a.prop)).toEqual(['functionVariant']);
    expect(plan.booleans.map((b) => b.prop)).toEqual(['deleteProp', 'defaultProp']);
  });

  it('rejects a decision that names a prop with a reserved word', () => {
    const problems = validateDecisions({ version: 1, sets: { Menu: { status: 'proposed', props: { Delete: { name: 'delete' } } } } });
    expect(problems.map((p) => p.message)).toEqual(['"delete" is reserved (a DOM or framework name).']);
  });

  it('renames Web Component props that would replace an element member', () => {
    expect(['focus', 'blur', 'click', 'remove', 'render', 'title', 'size'].map(wcProp)).toEqual(['focusValue', 'blurValue', 'clickValue', 'removeValue', 'renderValue', 'titleValue', 'size']);
  });

  it('exports one icon per name: shared Figma names once, colliding names numbered', () => {
    const icon = (figmaName: string, name: string, nodeId: string) => ({ figmaName, name, nodeId, svg: '<svg/>' });
    expect(uniqueIcons([icon('Checkbox', 'checkbox', '2:1'), icon('checkbox', 'checkbox', '3:1'), icon('Checkbox', 'checkbox', '4:1'), icon('Add', 'add', '1:1')]).map((i) => `${i.figmaName}→${i.name}`))
      .toEqual(['Add→add', 'Checkbox→checkbox', 'checkbox→checkbox2']);
  });
});

describe('token binding', () => {
  const tokens = loadTokens({ variables: { Theme: [['background', 'C', { White: '#ffffff', 'Gray 100': '#161616' }], ['layer', 'C', { White: '#f4f4f4', 'Gray 100': '#393939' }]] } });

  it('binds a layer to its own variable when the variable id is known, in whatever mode Figma drew it', () => {
    // Drawn in the Gray 100 theme: #393939 is no token's default value, but the id names the variable.
    const r = new TokenResolver(tokens, { 'VariableID:1:2': 'Theme:layer' });
    expect(r.css('#393939', 'VariableID:1:2', ['bg'])).toBe('var(--layer)');
    expect(r.decisions.at(-1)).toMatchObject({ reason: 'bound-by-id', token: '--layer' });
  });

  it('falls back to matching by value when ids are not known', () => {
    const r = new TokenResolver(tokens);
    expect(r.css('#f4f4f4', 'VariableID:1:2', ['bg'])).toBe('var(--layer)');
    expect(r.css('#393939', 'VariableID:9:9', ['bg'])).toBe('#393939');
  });
});

describe('generated React imports', () => {
  it('adds React APIs a component uses but its template did not import', async () => {
    const { withReactImports } = await import('../src/generate/templates/generic.ts');
    const tsx = "// x\nimport { useState, type ButtonHTMLAttributes } from 'react';\n\nexport const A = () => Children.map(c, (x) => (isValidElement(x) ? cloneElement(x) : useState(0)));\n";
    expect(withReactImports(tsx)).toContain("import { Children, cloneElement, isValidElement } from 'react';\nimport { useState, type ButtonHTMLAttributes } from 'react';");
    expect(withReactImports("import { Children, cloneElement, isValidElement } from 'react';\nChildren.map(a, b);")).toBe("import { Children, cloneElement, isValidElement } from 'react';\nChildren.map(a, b);");
  });
});

describe('Storybook toolbar keys', () => {
  it('turns any Figma collection name into a valid globals key', async () => {
    const { camel } = await import('../src/generate/wc/project.ts');
    expect(['Color-palette-1', 'AI---User-type', 'theme', '3-col', 'Theme'].map(camel)).toEqual(['colorPalette1', 'aIUserType', 'theme', '_3Col', 'theme']);
  });
});

describe('CSS custom property names', () => {
  it('keeps only characters valid in a CSS identifier', async () => {
    const { cssName } = await import('../src/generate/tokens.ts');
    expect(cssName('surface/bg/default', undefined)).toBe('--surface-bg-default');
    expect(cssName('Carbon for IBM Products/User profile images/Light', undefined)).toBe('--Carbon-for-IBM-Products-User-profile-images-Light');
    expect(cssName('Content switcher (low contrast)/content-switcher- background', undefined)).toBe('--Content-switcher-low-contrast-content-switcher-background');
    expect(cssName('x', 'var(--brand-primary)')).toBe('--brand-primary');
  });
});

describe('tokens whose value Figma could not give', () => {
  it('leaves them out of tokens.css and binds layers to their raw value instead', async () => {
    const { tokensCss } = await import('../src/generate/tokens.ts');
    // An alias to a variable missing from the file arrives as null.
    const set = loadTokens({ variables: { Theme: [['ok', 'C', '#0f62fe'], ['broken', 'C', null], ['viaBroken', 'C', '@Theme:broken']] } });
    const css = tokensCss(set, {});
    expect(css).toContain('--ok: #0f62fe;');
    expect(css).not.toMatch(/null|--broken|--viaBroken/);
    const r = new TokenResolver(set, { 'VariableID:1': 'Theme:broken', 'VariableID:2': 'Theme:ok' });
    expect(r.css('#da1e28', 'VariableID:1', ['bg'])).toBe('#da1e28');
    expect(r.css('#0f62fe', 'VariableID:2', ['bg'])).toBe('var(--ok)');
  });
});
