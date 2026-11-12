import { describe, expect, it } from 'vitest';

import { genericTemplate, type GenericCore } from '../src/generate/templates/generic.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import { attrFor, tagFor, wcGeneric, wcProp } from '../src/generate/wc/components.ts';
import { buildComponentSet } from '../src/ir/build.ts';
import { buttonSet, docFrame } from './fixtures/figma.ts';

const target = { id: 'x', archetype: 'generic', figma: { page: 'p', componentSet: { id: '1:1', name: 'Button' } } };
const set = buildComponentSet({ target, set: structuredClone(buttonSet), docFrames: [docFrame], componentNames: {}, resolve: () => undefined });
const ctx = { fileKey: 'F', version: '1', sets: { main: set }, resolver: new TokenResolver(loadTokens({ variables: {} })), icons: new Map() };
const react = genericTemplate(ctx, 'Chip', { title: 'Components/Chip', instance: () => undefined });
const wc = wcGeneric(ctx, 'Chip', react.core as GenericCore, { prefix: 'ds', packageName: 'pkg' }, () => undefined, (c) => tagFor('ds', c));

describe('Web Components target', () => {
  it('names elements, attributes and reserved props', () => {
    expect(tagFor('ds', 'DatePicker')).toBe('ds-date-picker');
    expect(attrFor('hasLeadingIcon')).toBe('has-leading-icon');
    expect(wcProp('title')).toBe('titleValue');
    expect(wcProp('variant')).toBe('variant');
  });

  it('reuses the exact CSS of the React output', () => {
    const reactCss = react.files.find((f) => f.path.endsWith('.module.css'))!.content;
    expect(wc.files.find((f) => f.path.endsWith('Chip.css'))!.content).toBe(reactCss);
  });

  it('defines a custom element with Figma props', () => {
    const el = wc.files.find((f) => f.path.endsWith('ds-chip.ts'))!.content;
    expect(el).toContain("customElements.define('ds-chip', DsChip)");
    expect(el).toMatch(/variant: \{ type: String, reflect: true/);
    expect(el).toContain('hasLeadingIcon: { type: Boolean, attribute: "has-leading-icon" }');
    expect(wc.typings[0]!.props.map((p) => p.name)).toEqual(['variant', 'size', 'disabled', 'hasLeadingIcon', 'label']);
  });

  it('never repeats an attribute on one element in the stories', () => {
    const stories = wc.files.find((f) => f.path.endsWith('.stories.ts'))!.content;
    const tags = [...stories.matchAll(/<ds-chip ([^>]*)>/g)].map((m) => m[1]!);
    expect(tags.length).toBeGreaterThan(5);
    for (const attrs of tags) {
      const names = [...attrs.matchAll(/[?.]?([a-z][\w-]*)=/g)].map((m) => m[1]);
      expect(new Set(names).size, attrs).toBe(names.length);
    }
  });
});
