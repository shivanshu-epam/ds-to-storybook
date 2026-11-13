import { describe, expect, it } from 'vitest';

import { genericTemplate, instanceRef, type GenericCore, type RegistryEntry } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { tagFor, wcGeneric } from '../src/generate/wc/components.ts';
import { buildComponentSet } from '../src/ir/build.ts';
import type { FigmaNode } from '../src/figma/types.ts';
import type { IRPart } from '../src/ir/types.ts';
import { buttonSet } from './fixtures/figma.ts';

// Control: State=Enabled/Focused/Disabled/Invalid × Selected=false/true, from the button fixture's layers.
const controlNames = ['State=Enabled, Selected=false', 'State=Enabled, Selected=true', 'State=Disabled, Selected=false'];
const controlNode: FigmaNode = {
  ...structuredClone(buttonSet),
  id: '5:1',
  name: 'RadioControl',
  componentPropertyDefinitions: {
    State: { type: 'VARIANT', defaultValue: 'Enabled', variantOptions: ['Enabled', 'Focused', 'Disabled', 'Invalid'] },
    Selected: { type: 'VARIANT', defaultValue: 'false', variantOptions: ['false', 'true'] },
  },
  children: structuredClone(buttonSet.children!).map((c, i) => ({ ...c, id: `5:${i + 2}`, name: controlNames[i]!, ...(i === 1 ? { fills: [{ type: 'SOLID' as const, color: { r: 1, g: 0, b: 0, a: 1 } }] } : {}) })),
};
// Group: a label and an items frame with three instances of a field.
const groupNode: FigmaNode = {
  id: '7:1',
  name: 'RadioGroup',
  type: 'COMPONENT_SET',
  componentPropertyDefinitions: { State: { type: 'VARIANT', defaultValue: 'Enabled', variantOptions: ['Enabled', 'Invalid'] } },
  children: ['Enabled', 'Invalid'].map((s, i) => ({
    id: `7:${i + 2}`,
    name: `State=${s}`,
    type: 'COMPONENT',
    layoutMode: 'VERTICAL',
    absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
    children: [
      { id: `7:${i}0`, name: 'group-label', type: 'TEXT', characters: 'Delivery speed' },
      { id: `7:${i}1`, name: '_items', type: 'FRAME', layoutMode: 'VERTICAL', children: [1, 2, 3].map((n) => ({ id: `7:${i}1${n}`, name: 'radio-field', type: 'INSTANCE', componentId: '6:2' })) },
    ],
  })),
};
const target = (name: string) => ({ id: name, archetype: 'radio', figma: { page: 'p', componentSet: { id: '1', name } } });
const control = buildComponentSet({ target: target('RadioControl'), set: controlNode, docFrames: [], componentNames: {}, resolve: () => undefined });
const group = buildComponentSet({ target: target('RadioGroup'), set: groupNode, docFrames: [], componentNames: {}, resolve: () => undefined });
const resolver = new TokenResolver(loadTokens({ variables: {} }));
const ctx = (main: typeof control) => ({ fileKey: 'F', version: '1', sets: { main }, resolver, icons: new Map() });
const related = { control: { name: 'RadioControl', set: control } };
const fieldEntry: RegistryEntry = { component: 'RadioField', importPath: '../RadioField/RadioField', kind: 'radio-field', set: { ...control, name: 'RadioField', properties: [], variants: [{ ...control.variants[0]!, nodeId: '6:2', values: {} }] } };
const instance = (part: IRPart) => (part.instanceComponentId === '6:2' ? instanceRef(fieldEntry, part, new Map()) : undefined);
const file = (files: { path: string; content: string }[], end: string) => files.find((f) => f.path.endsWith(end))!.content;

describe('radio templates', () => {
  const c = genericTemplate(ctx(control), 'RadioControl', { title: 'C', instance: () => undefined, behavior: 'radio', related });
  const g = genericTemplate(ctx(group), 'RadioGroup', { title: 'G', instance, behavior: 'radio-group', related });

  it('control: a native radio input, styled by :checked instead of a Selected prop', () => {
    const tsx = file(c.files, 'RadioControl.tsx');
    expect(tsx).toContain('type="radio"');
    expect(tsx).toContain('export const RadioControlContext = createContext');
    expect(tsx).not.toMatch(/selected\?:/);
    expect(tsx).toContain("aria-invalid={state === 'invalid' || undefined}");
    const css = file(c.files, 'RadioControl.module.css');
    expect(css).toContain(':has(> .input:checked)');
    expect(css).toContain('.input { position: absolute; inset: 0;');
    expect(file(c.files, 'RadioControl.stories.tsx')).toContain('{ defaultChecked: true }');
  });

  it('group: a named radiogroup that renders every repeated Figma item and shares name and value', () => {
    const tsx = file(g.files, 'RadioGroup.tsx');
    expect(tsx).toContain('role="radiogroup"');
    expect(tsx).toContain('aria-labelledby={labelId}');
    expect(tsx).toContain("import { RadioControlContext } from '../RadioControl/RadioControl';");
    expect(tsx.match(/<RadioField /g)?.length).toBe(3);
    expect(tsx).toContain('{children ?? (');
    expect(file(g.files, 'RadioGroup.stories.tsx')).toContain("userEvent.keyboard('{ArrowDown}')");
  });

  it('Web Components: the group manages selection, arrow keys and one Tab stop across shadow roots', () => {
    const wc = wcGeneric(ctx(group), 'RadioGroup', g.core as GenericCore, { prefix: 'ds', packageName: 'p' }, instance, (n) => tagFor('ds', n));
    const el = file(wc.files, 'ds-radio-group.ts');
    for (const e of ['ds-radio-register', 'ds-radio-select', 'ds-radio-move']) expect(el).toContain(e);
    expect(el).toContain('radio.tabStop = radio === stop');
    expect(el).toContain('<slot>');
    const ctl = file(wcGeneric(ctx(control), 'RadioControl', c.core as GenericCore, { prefix: 'ds', packageName: 'p' }, () => undefined, (n) => tagFor('ds', n)).files, 'ds-radio-control.ts');
    expect(ctl).toContain('static formAssociated = true;');
    expect(ctl).toContain('.checked=${live(this.checked)}');
    expect(file(wcGeneric(ctx(control), 'RadioControl', c.core as GenericCore, { prefix: 'ds', packageName: 'p' }, () => undefined, (n) => tagFor('ds', n)).files, 'RadioControl.css')).toBe(file(c.files, 'RadioControl.module.css'));
  });
});
