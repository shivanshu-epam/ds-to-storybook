import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { EXPORT_FORMAT, ExportReader, readZip, type ExportManifest } from '../src/figma/export.ts';
import type { FigmaNode } from '../src/figma/types.ts';

/** A minimal zip writer (the plugin writes the same layout): deflated or stored entries, central directory. */
function zip(entries: Record<string, string | Buffer>, store = false): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const data = store ? raw : deflateRawSync(raw);
    const n = Buffer.from(name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt32LE(crc32(raw), 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(n.length, 26);
    locals.push(head, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(store ? 0 : 8, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const page: FigmaNode = {
  id: '1:0', name: 'Components', type: 'CANVAS',
  children: [{ id: '2:0', name: 'Button', type: 'COMPONENT_SET', children: [{ id: '2:1', name: 'Size=Small', type: 'COMPONENT', children: [{ id: '2:2', name: 'Label', type: 'TEXT', characters: 'Go' }] }] }],
};
const manifest: ExportManifest = {
  format: EXPORT_FORMAT, plugin: '0.2.0', fileKey: 'KEY', fileName: 'Design', exportedAt: '2026-11-23T10:00:00Z',
  pages: [{ id: '1:0', name: 'Components', file: 'pages/0.json' }],
  components: { '2:1': { key: 'k1', name: 'Size=Small', componentSetId: '2:0' } },
  componentSets: { '2:0': { key: 'k0', name: 'Button' } },
  styles: { 'S:abc,9:9': { name: 'Brand/Primary', styleType: 'FILL' } },
  styleNodes: { 'S:abc,9:9': { id: 'S:abc,9:9', name: 'Brand/Primary', type: 'RECTANGLE', fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 } }] } },
  variables: { meta: { variables: {}, variableCollections: {} } },
  renders: { svg: ['2:1'], png: { scale: 2, ids: ['2:1'] } },
};

function exportFile(store = false): string {
  const file = join(mkdtempSync(join(tmpdir(), 'ds-export-')), 'figma-export.zip');
  writeFileSync(file, zip({ 'export.json': JSON.stringify(manifest), 'pages/0.json': JSON.stringify(page), 'svg/2-1.svg': '<svg/>', 'png/2-1@2x.png': Buffer.from([137, 80, 78, 71]) }, store));
  return file;
}

describe('Figma plugin export as the source (no REST API)', () => {
  it('reads stored and deflated zip entries', () => {
    for (const store of [true, false]) expect(readZip(zip({ 'a.txt': 'hello', 'b/c.json': '{}' }, store)).get('a.txt')?.toString()).toBe('hello');
  });

  it('answers the reader calls the API client answers, from the export', async () => {
    const r = new ExportReader(exportFile());
    const shallow = await r.file('KEY', 1);
    expect(shallow.document.children?.[0]).toEqual({ id: '1:0', name: 'Components', type: 'CANVAS' });
    expect(shallow.componentSets).toEqual(manifest.componentSets);
    const deep = await r.fileWithIds('KEY', ['2:2']);
    expect(deep.document.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]?.characters).toBe('Go');
    const nodes = await r.nodes('KEY', ['2:0', 'S:abc,9:9', '404:0']);
    expect(nodes.nodes['2:0']?.document.name).toBe('Button');
    expect(nodes.nodes['S:abc,9:9']?.document.fills?.[0]?.color?.b).toBe(1);
    expect(nodes.nodes['404:0']).toBeNull();
    expect(r.seenStyles()).toEqual(manifest.styles);
    expect(await r.localVariables()).toEqual(manifest.variables);
  });

  it('serves renders from the export, and null for ids it has no render of', async () => {
    const r = new ExportReader(exportFile());
    const svg = await r.images('KEY', ['2:1', '2:2'], 'svg');
    expect(svg.images).toEqual({ '2:1': 'export:svg/2-1.svg', '2:2': null });
    expect(await r.fetchText(svg.images['2:1']!)).toBe('<svg/>');
    const png = await r.images('KEY', ['2:1'], 'png', undefined, 2);
    expect((await r.fetchBinary(png.images['2:1']!))[1]).toBe(80);
  });

  it('gives the same content the same version, and says what is wrong with a bad file', () => {
    expect(new ExportReader(exportFile()).version).toBe(new ExportReader(exportFile(true)).version);
    expect(new ExportReader(exportFile()).version).toMatch(/^export-[0-9a-f]{16}$/);
    expect(() => new ExportReader('/nope/figma-export.zip')).toThrow(/run the ds-sync plugin/);
    const bad = join(mkdtempSync(join(tmpdir(), 'ds-export-')), 'x.zip');
    writeFileSync(bad, zip({ 'export.json': JSON.stringify({ ...manifest, format: 'other@9' }) }));
    expect(() => new ExportReader(bad)).toThrow(/not supported/);
  });
});
