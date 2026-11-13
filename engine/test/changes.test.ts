import { describe, expect, it } from 'vitest';

import { changeImages, changesMarkdown, diffIR } from '../src/changes/changes.ts';
import type { FigmaIR, IRComponentSet, IRVariant } from '../src/ir/types.ts';

const variant = (nodeId: string, name: string, fill: string, text = 'Button'): IRVariant => ({
  nodeId, name, values: Object.fromEntries(name.split(', ').map((p) => p.split('=') as [string, string])),
  style: { fills: [{ value: fill, variableId: null }], strokes: [], cornerRadius: { value: 8, variableId: null } },
  parts: [{ path: 'label', parent: '', name: 'label', type: 'TEXT', text, style: { fills: [], strokes: [] } }],
});
const set = (variants: IRVariant[], options = ['Primary', 'Danger'], hash = 'h'): IRComponentSet => ({
  targetId: 'auto.1:1', nodeId: '1:1', name: 'Button', description: '', page: 'p', notes: [], hash, docFrames: [],
  properties: [{ name: 'Variant', rawName: 'Variant', type: 'VARIANT', options, default: 'Primary' }],
  variants,
});
const ir = (version: string, components: IRComponentSet[]): FigmaIR => ({ irVersion: 1, fileKey: 'F', fileName: 'DS', version, lastModified: '', variables: { source: 'none', byId: {}, byName: {} }, components, missing: [] } as unknown as FigmaIR);

describe('Figma change summary', () => {
  const before = ir('1', [set([variant('1:2', 'Variant=Primary', '#4f46e5'), variant('1:3', 'Variant=Danger', '#dc2626')], ['Primary', 'Danger'], 'a')]);
  const after = ir('2', [set([variant('1:2', 'Variant=Primary', '#4f46e5'), variant('1:3', 'Variant=Danger', '#1ec857', 'Delete'), variant('1:4', 'Variant=Ghost', '#ffffff')], ['Primary', 'Danger', 'Ghost'], 'b')]);
  const c = diffIR(before, after, { '1:1': 'Button' });

  it('reports API, variant, style and content changes per component', () => {
    const lines = c.components[0]!.lines.join('\n');
    expect(lines).toContain('Property **Variant**: option Ghost added.');
    expect(lines).toContain('1 variant added: Variant=Ghost.');
    expect(lines).toContain('Variant=Danger: fill `#dc2626` → `#1ec857`.');
    expect(lines).toContain('Variant=Danger: "label" text `Button` → `Delete`.');
    expect(c.components[0]!.kinds.sort()).toEqual(['api', 'content', 'styles', 'variants']);
    expect(c.labels).toEqual(['component-api', 'components', 'content', 'styles']);
    expect(c.components[0]!.changedVariants.map((v) => v.nodeId).sort()).toEqual(['1:3', '1:4']);
  });

  it('skips unchanged sets and says so when nothing changed', () => {
    const same = diffIR(before, ir('2', before.components), { '1:1': 'Button' });
    expect(same.components).toEqual([]);
    expect(changesMarkdown(same)).toContain('with no changes to the components ds-sync generates');
  });

  it('writes Figma before/after renders for the changed variants', async () => {
    const files = new Map<string, Buffer | string>();
    const source = {
      images: async (_k: string, ids: string[], _f: 'png' | 'svg', version?: string) => ({ images: Object.fromEntries(ids.map((id) => [id, version === '1' && id === '1:4' ? null : `https://img/${version}/${id}`])) }),
      fetchBinary: async (url: string) => Buffer.from(url),
    };
    const n = await changeImages(source, c, 'out', (p, d) => files.set(p, d));
    expect(n).toBe(2);
    expect([...files.keys()].sort()).toEqual(['out/1_3-after.png', 'out/1_3-before.png', 'out/1_4-after.png', 'out/changes.html']);
    expect(String(files.get('out/changes.html'))).toContain('not in this version');
  });
});
