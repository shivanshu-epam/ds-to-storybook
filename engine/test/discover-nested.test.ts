import { describe, expect, it } from 'vitest';

import { discover } from '../src/discover/discover.ts';
import type { FigmaReader } from '../src/figma/client.ts';
import type { FigmaNode } from '../src/figma/types.ts';

/** A Blade-like file: each component page holds docs frames and a frame whose set sits six levels down. */
const set = (id: string, name: string): FigmaNode => ({
  id, name, type: 'COMPONENT_SET',
  componentPropertyDefinitions: { Size: { type: 'VARIANT', defaultValue: 'Small', variantOptions: ['Small', 'Large'] } },
  children: [{ id: `${id}a`, name: 'Size=Small', type: 'COMPONENT', children: [] }, { id: `${id}b`, name: 'Size=Large', type: 'COMPONENT', children: [] }],
} as FigmaNode);
const deep = (prefix: string, levels: number, leaf: FigmaNode): FigmaNode =>
  levels === 0 ? leaf : { id: `${prefix}${levels}`, name: `level ${levels}`, type: 'FRAME', children: [deep(prefix, levels - 1, leaf)] } as FigmaNode;
const pages: FigmaNode[] = [
  { id: '0:1', name: '❖ Badge', type: 'CANVAS', children: [
    { id: '1:1', name: '_Introduction', type: 'FRAME', children: [] },
    { id: '1:2', name: '_Thumb', type: 'COMPONENT', children: [] },
    { id: '1:3', name: 'Badge', type: 'FRAME', children: [deep('b', 6, set('9:1', 'Badge'))] },
  ] } as FigmaNode,
  { id: '0:2', name: '_Deprecation Ground', type: 'CANVAS', children: [{ id: '2:1', name: 'Old', type: 'FRAME', children: [set('9:2', 'Badge Old DEPRECATED')] }] } as FigmaNode,
  { id: '0:3', name: '❖ Chip', type: 'CANVAS', children: [{ id: '3:1', name: 'Chip', type: 'FRAME', children: [set('9:3', 'Chip'), set('9:4', 'Chip (Old) DO NOT USE')] }] } as FigmaNode,
];
const byId = new Map<string, FigmaNode>();
const index = (n: FigmaNode) => { byId.set(n.id, n); (n.children ?? []).forEach(index); };
pages.forEach(index);
/** Like Figma: below the depth limit, containers come back with an empty child list. */
const cut = (n: FigmaNode, depth: number | undefined, d = 0): FigmaNode => ({ ...n, children: depth !== undefined && d >= depth ? [] : (n.children ?? []).map((c) => cut(c, depth, d + 1)) }) as FigmaNode;
const calls: number[] = [];
const client: FigmaReader = {
  file: async () => ({ name: 'Blade-like', version: '1', lastModified: '', document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: pages.map((p) => cut(p, 1)) }, componentSets: {} }) as never,
  nodes: async (_k, ids, _v, depth) => { calls.push(ids.length); return { nodes: Object.fromEntries(ids.map((id) => [id, { document: cut(byId.get(id)!, depth) }])) } as never; },
  fileWithIds: async () => { throw new Error('not used'); },
  localVariables: async () => { throw new Error('not used'); },
};

describe('discovery in deeply nested files', () => {
  it('finds sets several levels inside page frames, and leaves out retired sets and internal pages', async () => {
    const logs: string[] = [];
    const d = await discover(client, 'F', {}, (m) => logs.push(m));
    expect(d.sets.map((s) => s.name).sort()).toEqual(['Badge', 'Chip']);
    expect(d.pages.find((p) => p.name === '❖ Badge')?.kind).toBe('components');
    expect(d.pages.find((p) => p.name === '_Deprecation Ground')?.kind).toBe('skip');
    expect(logs.join('\n')).toMatch(/left out 1 retired set/);
  });
});
