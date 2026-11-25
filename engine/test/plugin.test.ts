import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { ExportReader } from '../src/figma/export.ts';

type Posted = { type: string; name?: string; text?: string; bytes?: Uint8Array; message?: string; summary?: Record<string, number> };

/** Runs the Figma plugin (plugin/code.js) against a fake Figma file (test/fixtures/fake-figma.mjs). */
async function runPlugin(): Promise<Posted[]> {
  const fixture = './fixtures/fake-figma.mjs';
  const { runPlugin: run } = (await import(fixture)) as { runPlugin: (code: URL) => Promise<Posted[]> };
  return run(new URL('../../plugin/code.js', import.meta.url));
}

function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const d = deflateRawSync(e.data); const n = Buffer.from(e.name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc32(e.data), 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(e.data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(h, n, d); central.push(c, n); offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

describe('Figma plugin export (plugin/code.js)', () => {
  it('finishes when a component set is broken in Figma, and lists what it skipped', async () => {
    const posted = await runPlugin();
    expect(posted.find((m) => m.type === 'error')).toBeUndefined();
    const manifest = JSON.parse(posted.find((m) => m.name === 'export.json')!.text!) as { warnings: { name: string; what: string; error: string }[] };
    expect(manifest.warnings).toEqual([expect.objectContaining({ name: 'broken', what: 'componentProperties', error: expect.stringMatching(/existing errors/) })]);
  });

  it('keeps what ds-sync reads inside components, and instances elsewhere without their contents', async () => {
    const posted = await runPlugin();
    const page = (n: number) => JSON.parse(posted.find((m) => m.name === `pages/${n}.json`)!.text!);
    const v = page(0).children[0].children[0];
    expect(v).toMatchObject({ layoutMode: 'HORIZONTAL', paddingLeft: 16, fills: [{ type: 'SOLID', color: { r: 0.06, g: 0.38, b: 1, a: 1 } }] });
    expect(v.children[0]).toMatchObject({ type: 'INSTANCE', componentId: '9:1', children: [{ type: 'VECTOR' }] });
    expect(v.children[1].style).toMatchObject({ fontFamily: 'IBM Plex Sans', fontWeight: 400, fontSize: 14, lineHeightPx: 18, letterSpacing: 0.14 });
    expect(page(1).children[0]).toMatchObject({ type: 'INSTANCE', componentId: '2:1', componentProperties: { Size: { type: 'VARIANT', value: 'Small' } } });
    expect(page(1).children[0].children).toBeUndefined();
  });

  it('writes an export ds-sync reads: pages, components, styles, variables and renders', async () => {
    const posted = await runPlugin();
    const file = join(mkdtempSync(join(tmpdir(), 'ds-plugin-')), 'figma-export.zip');
    writeFileSync(file, zip(posted.filter((m) => m.type === 'entry').map((m) => ({ name: m.name!, data: m.text !== undefined ? Buffer.from(m.text) : Buffer.from(m.bytes!) }))));
    const r = new ExportReader(file);
    expect(r.manifest.fileKey).toBe('CARBONKEY');
    expect((await r.file('K', 1)).document.children!.map((p) => p.name)).toEqual(['Button', 'Docs']);
    expect((await r.nodes('K', ['2:0'])).nodes['2:0']!.document.componentPropertyDefinitions).toHaveProperty('Size');
    expect(Object.values(r.seenStyles()).map((s) => s.name)).toEqual(['Brand/Blue', 'Body/Regular']);
    expect(Object.keys((await r.localVariables()).meta.variables)).toEqual(['V:1']);
    expect((await r.images('K', ['9:1'], 'svg')).images['9:1']).toBe('export:svg/9-1.svg');
  });
});
