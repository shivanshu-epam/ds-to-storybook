import type { FileResponse, FigmaNode, NodesResponse } from '../../src/figma/types.ts';

const blue = { r: 0, g: 0.333, b: 1, a: 1 };
const alias = (id: string) => ({ type: 'VARIABLE_ALIAS' as const, id });

function variant(id: string, name: string, bound: boolean): FigmaNode {
  return {
    id,
    name,
    type: 'COMPONENT',
    layoutMode: 'HORIZONTAL',
    paddingLeft: 16,
    paddingRight: 16,
    itemSpacing: 8,
    absoluteBoundingBox: { x: 0, y: 0, width: 96, height: 32 },
    fills: [{ type: 'SOLID', color: blue, ...(bound ? { boundVariables: { color: alias('VariableID:1:1') } } : {}) }],
    boundVariables: bound ? { paddingLeft: alias('VariableID:2:1'), paddingRight: alias('VariableID:2:1') } : {},
    children: [
      { id: `${id}-icon`, name: 'Icon', type: 'INSTANCE', componentId: '9:1' },
      { id: `${id}-label`, name: 'Label', type: 'TEXT', characters: 'Button', fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }] },
    ],
  };
}

export const buttonSet: FigmaNode = {
  id: '1:1',
  name: 'Button',
  type: 'COMPONENT_SET',
  description: 'Triggers an action.',
  componentPropertyDefinitions: {
    Variant: { type: 'VARIANT', defaultValue: 'Primary', variantOptions: ['Primary', 'Secondary', 'Tertiary'] },
    Size: { type: 'VARIANT', defaultValue: 'Sm', variantOptions: ['Sm', 'Md'] },
    State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Disabled'] },
    'Has leading icon#3:0': { type: 'BOOLEAN', defaultValue: false },
    'Label#4:0': { type: 'TEXT', defaultValue: 'Button' },
  },
  children: [
    variant('1:2', 'Variant=Primary, Size=Sm, State=Default', true),
    variant('1:3', 'Variant=Primary, Size=Md, State=Default', true),
    variant('1:4', 'Variant=Secondary, Size=Sm, State=Hover', false),
  ],
};

export const docFrame: FigmaNode = {
  id: '1:50',
  name: 'Documentation / Accessibility',
  type: 'FRAME',
  children: [
    { id: '1:52', name: 'body', type: 'TEXT', characters: 'Press Enter to activate.', absoluteBoundingBox: { x: 0, y: 40, width: 10, height: 10 } },
    { id: '1:51', name: 'title', type: 'TEXT', characters: 'Keyboard', style: { fontSize: 20 }, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
  ],
};

export const fileResponse: FileResponse = {
  name: 'Fixture DS',
  version: '42',
  lastModified: '2026-11-01T00:00:00Z',
  document: {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      { id: '0:1', name: '↳ button', type: 'CANVAS', children: [{ ...buttonSet, children: [] }, { id: '1:50', name: 'Documentation / Accessibility', type: 'FRAME' }] },
    ],
  },
};

export const nodesResponse: NodesResponse = {
  name: 'Fixture DS',
  version: '42',
  lastModified: '2026-11-01T00:00:00Z',
  nodes: {
    '1:1': { document: buttonSet, components: { '9:1': { key: 'k-icon', name: 'Icon/action/add' } }, componentSets: { '1:1': { key: 'set-key-button', name: 'Button' } } },
    '1:50': { document: docFrame },
  },
};
