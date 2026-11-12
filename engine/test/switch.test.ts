import { describe, expect, it } from 'vitest';

import { genericTemplate, switchAxis, analyzeAxes, type GenericCore } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { tagFor, wcGeneric } from '../src/generate/wc/components.ts';
import { buildComponentSet } from '../src/ir/build.ts';
import type { FigmaNode } from '../src/figma/types.ts';
import { buttonSet } from './fixtures/figma.ts';

// A switch-shaped set: Value=Off/On, State=Default/Disabled (built from the button fixture's layers).
const names = ['Value=Off, State=Default', 'Value=On, State=Default', 'Value=Off, State=Disabled'];
const switchSet: FigmaNode = {
  ...structuredClone(buttonSet),
  name: 'Switch',
  componentPropertyDefinitions: {
    Value: { type: 'VARIANT', defaultValue: 'Off', variantOptions: ['Off', 'On'] },
    State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Disabled'] },
  },
  children: structuredClone(buttonSet.children!).map((c, i) => ({ ...c, name: names[i]! })),
};
const target = { id: 'x', archetype: 'switch', figma: { page: 'p', componentSet: { id: '1:1', name: 'Switch' } } };
const set = buildComponentSet({ target, set: switchSet, docFrames: [], componentNames: {}, resolve: () => undefined });
const tokens = loadTokens({ variables: { 'semantic.color': [['border/interactive/focus', 'C', { light: '#4f46e5' }, 'var(--border-interactive-focus)']] } });
const ctx = { fileKey: 'F', version: '1', sets: { main: set }, resolver: new TokenResolver(tokens), icons: new Map() };
const react = genericTemplate(ctx, 'Switch', { title: 'Components/Switch', instance: () => undefined, behavior: 'switch' });
const core = react.core as GenericCore;
const file = (end: string, files = react.files) => files.find((f) => f.path.endsWith(end))!.content;

describe('switch template', () => {
  it('finds the on/off axis', () => {
    const found = switchAxis(analyzeAxes(set));
    expect(found?.axis.figma).toBe('Value');
    expect([found?.off, found?.on]).toEqual(['off', 'on']);
    expect(core.behavior?.focusColor).toBe('var(--border-interactive-focus)');
  });

  it('renders a native button with role="switch" and checked state instead of a Value prop', () => {
    const tsx = file('Switch.tsx');
    expect(tsx).toContain('role="switch"');
    expect(tsx).toContain('aria-checked={on}');
    expect(tsx).toContain("data-value={on ? 'on' : 'off'}");
    expect(tsx).toContain('disabled={disabled}');
    expect(tsx).not.toMatch(/value\?: 'off' \| 'on'/);
    expect(tsx).toContain('onCheckedChange?: (checked: boolean) => void;');
    // Only phrasing content inside a <button>.
    expect(tsx).not.toContain('<div');
  });

  it('adds a focus ring from the focus token when Figma has no focus state', () => {
    expect(file('Switch.module.css')).toContain('outline: 2px solid var(--border-interactive-focus)');
    expect(core.assumptions.join(' ')).toMatch(/no focus state/);
  });

  it('writes keyboard and disabled play tests, and maps Value cells to checked', () => {
    const stories = file('Switch.stories.tsx');
    expect(stories).toMatch(/getByRole\('switch', \{ name: ['"]Switch['"] \}\)/);
    expect(stories).toContain("userEvent.keyboard(' ')");
    expect(stories).toContain('export const DisabledDoesNotToggle');
    expect(stories).toContain('{ checked: true }');
  });

  it('gives the Web Component the same behaviour, form-associated', () => {
    const wc = wcGeneric(ctx, 'Switch', core, { prefix: 'ds', packageName: 'pkg' }, () => undefined, (c) => tagFor('ds', c));
    const el = file('ds-switch.ts', wc.files);
    expect(el).toContain('static formAssociated = true;');
    expect(el).toContain('<button type="button" role="switch"');
    expect(el).toContain("new Event('change', { bubbles: true, composed: true })");
    expect(file('Switch.css', wc.files)).toBe(file('Switch.module.css'));
    expect(wc.typings[0]!.props.map((p) => p.name)).toEqual(['checked', 'accessibleLabel', 'name', 'value', 'disabled']);
  });

  it('falls back to visuals only, with a gap, when there is no on/off axis', () => {
    const plain = genericTemplate({ ...ctx, sets: { main: buildComponentSet({ target, set: structuredClone(buttonSet), docFrames: [], componentNames: {}, resolve: () => undefined }) } }, 'Toggle', { title: 'T', instance: () => undefined, behavior: 'switch' });
    expect((plain.core as GenericCore).behavior).toBeUndefined();
    expect(plain.report.gaps.join(' ')).toMatch(/no on\/off variant axis/);
  });
});
