import { describe, expect, it } from 'vitest';

import { genericTemplate, type GenericCore } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { tagFor, wcGeneric } from '../src/generate/wc/components.ts';
import { buildComponentSet } from '../src/ir/build.ts';
import type { FigmaNode } from '../src/figma/types.ts';

const box = { x: 0, y: 0, width: 100, height: 20 };
const variant = (id: string, type: string, withClose: boolean): FigmaNode => ({
  id,
  name: `Type=${type}`,
  type: 'COMPONENT',
  layoutMode: 'VERTICAL',
  absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 160 },
  children: [
    {
      id: `${id}h`, name: '_header', type: 'FRAME', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box,
      children: [
        { id: `${id}t`, name: '_title', type: 'TEXT', characters: 'Delete file?', componentPropertyReferences: { characters: 'Title#1:0' }, absoluteBoundingBox: box },
        // Alert has no close icon at all (not just hidden).
        ...(withClose ? [{ id: `${id}c`, name: '_close-icon', type: 'INSTANCE', componentId: 'icon:close', componentPropertyReferences: { visible: 'Has close button#2:0' }, absoluteBoundingBox: { x: 0, y: 0, width: 20, height: 20 } }] : []),
      ],
    },
    { id: `${id}b`, name: '_body', type: 'FRAME', layoutMode: 'VERTICAL', absoluteBoundingBox: box, children: [{ id: `${id}bt`, name: '_body-content', type: 'TEXT', characters: 'This cannot be undone.', componentPropertyReferences: { characters: 'Body content#3:0' }, absoluteBoundingBox: box }] },
    { id: `${id}f`, name: '_footer', type: 'FRAME', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box, children: [] },
  ],
} as FigmaNode);
const node: FigmaNode = {
  id: '8:1',
  name: 'Dialog',
  type: 'COMPONENT_SET',
  componentPropertyDefinitions: {
    'Title#1:0': { type: 'TEXT', defaultValue: 'Delete file?' },
    'Has close button#2:0': { type: 'BOOLEAN', defaultValue: true },
    'Body content#3:0': { type: 'TEXT', defaultValue: 'This cannot be undone.' },
    Type: { type: 'VARIANT', defaultValue: 'Confirmation', variantOptions: ['Confirmation', 'Alert'] },
  },
  children: [variant('8:2', 'Confirmation', true), variant('8:3', 'Alert', false)],
};
const set = buildComponentSet({ target: { id: 'd', archetype: 'dialog', figma: { page: 'p', componentSet: { id: '8:1', name: 'Dialog' } } }, set: node, docFrames: [], componentNames: { 'icon:close': 'Icon/action/close/20' }, resolve: () => undefined });
const tokens = loadTokens({ variables: { 'semantic.color': [['overlay/default', 'C', { light: '#00000080' }, 'var(--overlay-default)']] } });
const icons = new Map([['Icon/action/close/20', { figmaName: 'Icon/action/close/20', name: 'actionClose20', nodeId: '1', svg: '<svg></svg>' }]]);
const ctx = { fileKey: 'F', version: '1', sets: { main: set }, resolver: new TokenResolver(tokens), icons };
const react = genericTemplate(ctx, 'Dialog', { title: 'Components/Dialog', instance: () => undefined, behavior: 'dialog' });
const core = react.core as GenericCore;
const file = (files: { path: string; content: string }[], end: string) => files.find((f) => f.path.endsWith(end))!.content;

describe('dialog template', () => {
  it('finds the title, body, close and footer layers', () => {
    expect(core.dialog).toMatchObject({ title: 'title', body: 'body', close: 'closeIcon', footer: 'footer', alertValue: 'alert', backdrop: 'var(--overlay-default)' });
  });

  it('renders a native dialog: named, described, alertdialog for Alert, closable', () => {
    const tsx = file(react.files, 'Dialog.tsx');
    expect(tsx).toContain('<dialog');
    expect(tsx).toContain("role={type === 'alert' ? 'alertdialog' : undefined}");
    expect(tsx).toContain('aria-labelledby={titleId}');
    expect(tsx).toContain('aria-describedby={bodyId}');
    expect(tsx).toContain('dialog.showModal()');
    expect(tsx).toContain("if (event.key === 'Escape' && !event.defaultPrevented)");
    expect(tsx).toContain('aria-label="Close" onClick={() => setOpen(false)}');
    expect(tsx).toContain('{children ?? (');
    expect(tsx).toContain('{footer ?? (');
    const css = file(react.files, 'Dialog.module.css');
    expect(css).toContain('.root:not([open]) { display: none; }');
    expect(css).toContain('.root::backdrop { background: var(--overlay-default); }');
  });

  it('hides a property-bound layer in variants that do not have it', () => {
    expect(file(react.files, 'Dialog.module.css')).toMatch(/\.root:where\(\[data-type="alert"\]\) \.closeIcon \{\n {2}display: none;/);
  });

  it('Web Component: native dialog in the shadow root, with body and footer slots', () => {
    const wc = wcGeneric(ctx, 'Dialog', core, { prefix: 'ds', packageName: 'p' }, () => undefined, (n) => tagFor('ds', n));
    const el = file(wc.files, 'ds-dialog.ts');
    expect(el).toContain('<dialog class="root"');
    expect(el).toContain('<slot name="footer">');
    expect(el).toContain("new CustomEvent('open-change'");
    expect(file(wc.files, 'Dialog.css')).toBe(file(react.files, 'Dialog.module.css'));
  });
});
