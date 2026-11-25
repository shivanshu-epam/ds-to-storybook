import { describe, expect, it } from 'vitest';

import { matchExport, moduleExports, readComponentApis } from '../src/code/api.ts';
import { mapComponent } from '../src/code/map.ts';
import type { IRComponentSet } from '../src/ir/types.ts';

const src = { from: './test/fixtures/code-lib/index.ts', root: '.' };
const set = (name: string, properties: IRComponentSet['properties']): IRComponentSet => ({ targetId: name, nodeId: '1:1', name, description: '', page: 'p', properties, variants: [], docFrames: [], notes: [], hash: '' });
const v = (name: string, options: string[], d = options[0]!) => ({ name, rawName: name, type: 'VARIANT' as const, default: d, options });

describe('code mode: reading the API', () => {
  const exportsList = moduleExports(src);
  const apis = readComponentApis(src, ['Button', 'Toggle', 'InlineNotification', 'Missing']);

  it('lists component exports and reads own props of function, forwardRef and polymorphic components', () => {
    expect(exportsList).toEqual(expect.arrayContaining(['Button', 'ButtonSkeleton', 'Toggle', 'InlineNotification']));
    const button = apis.get('Button')!;
    expect(button.props.map((p) => p.name)).toEqual(['children', 'disabled', 'hasIconOnly', 'isExpressive', 'kind', 'renderIcon', 'size']);
    expect(button.props.find((p) => p.name === 'kind')!.type).toEqual({ kind: 'enum', options: ['primary', 'secondary', 'danger--primary', 'ghost'] });
    expect(button.props.find((p) => p.name === 'kind')!.description).toBe('The kind of button.');
    expect(apis.get('InlineNotification')!.props.map((p) => p.name)).toEqual(['children', 'kind', 'title']);
    expect(apis.get('Missing')!.found).toBe(false);
  });

  it('matches generated names to exports by words and without Default / Base', () => {
    const ex = ['Button', 'InlineNotification', 'TextInput', 'FluidTextInput'];
    expect(matchExport('NotificationInline', ex)).toBe('InlineNotification');
    expect(matchExport('TextInputDefault', ex)).toBe('TextInput');
    expect(matchExport('TextInputFluid', ex)).toBe('FluidTextInput');
    expect(matchExport('TableCell', ex)).toBeUndefined();
  });

  it('maps Figma properties to code: enums, sizes, values that are booleans, states and skeletons', () => {
    const m = mapComponent('Button', [set('Button', [
      v('Style', ['Primary', 'Secondary', 'Danger primary', 'Ghost']),
      v('Type', ['Text + Icon', 'Icon only']),
      v('Size', ['2X large', 'Large', 'Small', 'Expressive'], 'Large'),
      v('State', ['Enabled', 'Hover', 'Disabled', 'Skeleton']),
      { name: 'Button text', rawName: 'Button text#1', type: 'TEXT', default: 'Button' },
      { name: 'Resizer', rawName: 'Resizer#2', type: 'BOOLEAN', default: false },
    ])], apis.get('Button')!, exportsList);
    const by = (f: string) => m.mappings.find((x) => x.figma === f)!;
    expect(by('Style')).toMatchObject({ code: 'kind', shape: 'enum', values: { 'Danger primary': { value: 'danger--primary' } } });
    expect(by('Type')).toMatchObject({ code: 'hasIconOnly', shape: 'axis-to-boolean', values: { 'Icon only': { value: 'true' }, 'Text + Icon': { value: 'false' } } });
    expect(by('Size').values).toEqual({ '2X large': { value: '2xl' }, Large: { value: 'lg' }, Small: { value: 'sm' }, Expressive: { prop: 'isExpressive', value: true } });
    expect(by('State').values).toEqual({ Enabled: { value: 'base' }, Hover: { css: 'hover' }, Disabled: { prop: 'disabled', value: true }, Skeleton: { component: 'ButtonSkeleton' } });
    expect(by('Button text')).toMatchObject({ code: 'children', shape: 'children' });
    expect(by('Resizer').shape).toBe('none');
    expect(m.codeOnly).toEqual(['renderIcon']);
    expect(m.conflicts.join(' ')).toMatch(/"Resizer" has no counterpart/);
  });

  it('flags opposite toggles, prefers exact names, and gives form controls no children', () => {
    const m = mapComponent('Toggle', [set('Toggle', [
      { name: 'Show label', rawName: 'Show label#1', type: 'BOOLEAN', default: true },
      { name: 'Label text', rawName: 'Label text#2', type: 'TEXT', default: 'Label' },
      { name: 'State text', rawName: 'State text#3', type: 'TEXT', default: 'On' },
      v('State', ['Enabled', 'Focus', 'Read-only']),
    ])], apis.get('Toggle')!, exportsList);
    const by = (f: string) => m.mappings.find((x) => x.figma === f)!;
    expect(by('Show label')).toMatchObject({ code: 'hideLabel', shape: 'inverted' });
    expect(by('Label text')).toMatchObject({ code: 'labelText', confidence: 'high' });
    expect(by('State text').code).not.toBe('children');
    expect(by('State').values!['Read-only']).toEqual({ prop: 'readOnly', value: true });
  });
});
