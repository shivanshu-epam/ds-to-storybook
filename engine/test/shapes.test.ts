import { describe, expect, it } from 'vitest';

import { buildComponentSet } from '../src/ir/build.ts';
import { genericTemplate } from '../src/generate/templates/generic.ts';
import { svgColors } from '../src/generate/icons.ts';
import { loadTokens, TokenResolver } from '../src/generate/tokens.ts';
import type { FigmaNode } from '../src/figma/types.ts';

const resolver = new TokenResolver(loadTokens({ variables: {} }));
const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
const grey = { type: 'SOLID', color: { r: 0.46, g: 0.56, b: 0.65, a: 1 } };

describe('vector shapes (fidelity step 8)', () => {
  const node: FigmaNode = {
    id: '5:1', name: 'Badge', type: 'COMPONENT_SET',
    componentPropertyDefinitions: { Tone: { type: 'VARIANT', defaultValue: 'A', variantOptions: ['A'] } },
    children: [{
      id: '5:2', name: 'Tone=A', type: 'COMPONENT', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(60, 20),
      children: [
        { id: '5:3', name: 'star', type: 'STAR', fills: [grey], absoluteBoundingBox: box(16, 16) },
        { id: '5:4', name: 'mask', type: 'BOOLEAN_OPERATION', fills: [grey], absoluteBoundingBox: box(16, 16), children: [{ id: '5:5', name: 'Icon/user', type: 'INSTANCE', componentId: 'ic', absoluteBoundingBox: box(16, 16), children: [] }] },
      ],
    } as FigmaNode],
  };
  const set = buildComponentSet({ target: { id: 'b', archetype: 'generic', figma: { page: 'p', componentSet: { id: '5:1', name: 'Badge' } } }, set: node, docFrames: [], componentNames: { ic: 'Icon/user' }, resolve: () => undefined });
  const star = set.variants[0]!.parts.find((p) => p.name === 'star')!;

  it('records the node id of shapes CSS cannot draw', () => {
    expect(star.nodeId).toBe('5:3');
  });

  it('masks a one-colour shape with its Figma outline, keeping the fill colour', () => {
    star.shape = { uri: 'data:image/svg+xml,x', mono: true };
    const r = genericTemplate({ fileKey: 'F', version: '1', sets: { main: set }, resolver, icons: new Map() }, 'Badge', { title: 'B', instance: () => undefined });
    const css = r.files.find((f) => f.path.endsWith('.module.css'))!.content;
    expect(css).toMatch(/\.star \{[^}]*mask: url\("data:image\/svg\+xml,x"\) center \/ 100% 100% no-repeat;/);
    expect(css).toMatch(/\.star \{[^}]*background: #758fa6;/);
    expect(r.report.gaps.join(' ')).not.toMatch(/"star" is a star shape/);
    // A boolean shape around an icon paints the icon, not a box behind it.
    expect(css).toMatch(/\.mask \{[^}]*background: transparent;[^}]*color: #758fa6;/s);
  });

  it('tells one-colour from multi-colour SVGs', () => {
    expect(svgColors('<path fill="#000"/><path stroke="#000" fill="none"/>').size).toBe(1);
    expect(svgColors('<path fill="#000"/><path fill="url(#g)"/>').size).toBe(2);
  });
});
