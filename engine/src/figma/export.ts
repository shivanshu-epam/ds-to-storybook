// A Figma file read from a ds-sync plugin export (figma-export.zip) instead of the REST API.
// The plugin runs inside Figma, so it has no API rate limits and works on every plan, variables included.
// The export holds the same JSON shapes the REST API returns, so the rest of ds-sync cannot tell the two apart.
import { existsSync, readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

import { sha256 } from '../util/core.ts';
import type { FigmaReader, FigmaRenderer } from './client.ts';
import type { FigmaNode, FileResponse, LocalVariablesResponse, NodesResponse, StyleMeta } from './types.ts';

export const EXPORT_FORMAT = 'ds-sync/figma-export@1';

/** export.json inside the zip. Pages are separate files (pages/<n>.json) so large files stay manageable. */
export interface ExportManifest {
  format: typeof EXPORT_FORMAT;
  /** The plugin version that wrote it. */
  plugin: string;
  fileKey: string;
  fileName: string;
  /** When the export was made (ISO). */
  exportedAt: string;
  /** Page ids, in document order, with their file in the zip. */
  pages: { id: string; name: string; file: string }[];
  components: Record<string, { key: string; name: string; componentSetId?: string; description?: string }>;
  componentSets: Record<string, { key: string; name: string; description?: string }>;
  /** Local styles, keyed by style id, and their definitions (a node carrying the style's paint, text or effect). */
  styles: Record<string, StyleMeta>;
  styleNodes: Record<string, FigmaNode>;
  /** The Variables REST API response shape (every plan: the plugin reads variables directly). */
  variables?: LocalVariablesResponse;
  /** Rendered images in the zip: "svg/<id>.svg" and "png/<id>@<scale>x.png". */
  renders: { svg: string[]; png: { scale: number; ids: string[] } };
}

/** Entries of a zip file (stored or deflated), read with Node's zlib. Enough for the exports the plugin writes. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // End of central directory: the last 0x06054b50 signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file (no end of central directory).');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip: bad central directory entry.');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    if (!name.endsWith('/')) out.set(name, method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : (() => { throw new Error(`Zip entry ${name}: compression method ${method} is not supported.`); })());
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Keeps a node's children down to `depth` levels (REST "depth": 1 = the node and its children). */
function prune(node: FigmaNode, depth: number | undefined): FigmaNode {
  if (depth === undefined || !node.children) return node;
  if (depth <= 0) { const { children: _c, ...rest } = node; return rest as FigmaNode; }
  return { ...node, children: node.children.map((c) => prune(c, depth - 1)) };
}

export class ExportReader implements FigmaReader, FigmaRenderer {
  readonly manifest: ExportManifest;
  /** A version id for this export's content: the same export gives the same id. */
  readonly version: string;
  private readonly files: Map<string, Buffer>;
  private document?: FigmaNode;
  private index?: Map<string, FigmaNode>;

  constructor(readonly path: string) {
    if (!existsSync(path)) throw new Error(`Figma export not found: ${path}. In Figma, run the ds-sync plugin and save its export there.`);
    this.files = readZip(readFileSync(path));
    const raw = this.files.get('export.json');
    if (!raw) throw new Error(`${path} is not a ds-sync Figma export (no export.json).`);
    this.manifest = JSON.parse(raw.toString('utf8')) as ExportManifest;
    if (this.manifest.format !== EXPORT_FORMAT) throw new Error(`${path}: export format "${this.manifest.format}" is not supported (expected ${EXPORT_FORMAT}). Update the ds-sync plugin or ds-sync.`);
    this.version = `export-${sha256([...this.manifest.pages.map((pg) => this.files.get(pg.file) ?? Buffer.alloc(0)), raw].map((b) => sha256(b.toString('utf8'))).join('')).slice(0, 16)}`;
  }

  private doc(): FigmaNode {
    if (this.document) return this.document;
    const pages = this.manifest.pages.map((pg) => {
      const b = this.files.get(pg.file);
      if (!b) throw new Error(`${this.path}: page file ${pg.file} is missing.`);
      return JSON.parse(b.toString('utf8')) as FigmaNode;
    });
    this.document = { id: '0:0', name: 'Document', type: 'DOCUMENT', children: pages };
    return this.document;
  }

  private byId(): Map<string, FigmaNode> {
    if (this.index) return this.index;
    const m = new Map<string, FigmaNode>();
    const walk = (n: FigmaNode) => { m.set(n.id, n); n.children?.forEach(walk); };
    walk(this.doc());
    for (const [id, n] of Object.entries(this.manifest.styleNodes ?? {})) if (!m.has(id)) m.set(id, n);
    this.index = m;
    return m;
  }

  private meta() {
    return { name: this.manifest.fileName, version: this.version, lastModified: this.manifest.exportedAt };
  }

  private response(depth: number | undefined): FileResponse {
    return { ...this.meta(), document: prune(this.doc(), depth), components: this.manifest.components, componentSets: this.manifest.componentSets, styles: this.manifest.styles };
  }

  async file(_fileKey: string, depth = 2): Promise<FileResponse> {
    return this.response(depth);
  }

  async nodes(_fileKey: string, ids: string[], _version?: string, depth?: number): Promise<NodesResponse> {
    const index = this.byId();
    const nodes: NodesResponse['nodes'] = {};
    for (const id of ids) {
      const n = index.get(id);
      nodes[id] = n ? { document: prune(n, depth), components: this.manifest.components, componentSets: this.manifest.componentSets, styles: this.manifest.styles } : null;
    }
    return { ...this.meta(), nodes };
  }

  /** The whole tree (the API returns the given nodes and their ancestors; the full tree contains them). */
  async fileWithIds(_fileKey?: string, _ids?: string[]): Promise<FileResponse> {
    return this.response(undefined);
  }

  async localVariables(): Promise<LocalVariablesResponse> {
    if (!this.manifest.variables) throw Object.assign(new Error('This export has no variables.'), { status: 404 });
    return this.manifest.variables;
  }

  seenStyles(): Record<string, StyleMeta> {
    return { ...this.manifest.styles };
  }

  /** Images are files in the export; the "URL" points into it. Ids without a render get null, as with the API. */
  async images(_fileKey: string, ids: string[], format: 'svg' | 'png', _version?: string, scale?: number): Promise<{ images: Record<string, string | null> }> {
    const images: Record<string, string | null> = {};
    for (const id of ids) {
      const name = format === 'svg' ? `svg/${safe(id)}.svg` : `png/${safe(id)}@${scale ?? this.manifest.renders.png.scale}x.png`;
      images[id] = this.files.has(name) ? `export:${name}` : null;
    }
    return { images };
  }

  async fetchText(url: string): Promise<string> {
    return (await this.fetchBinary(url)).toString('utf8');
  }

  async fetchBinary(url: string): Promise<Buffer> {
    const b = url.startsWith('export:') ? this.files.get(url.slice(7)) : undefined;
    if (!b) throw new Error(`Not in the Figma export: ${url}`);
    return b;
  }
}

/** File-name form of a node id ("12:34" → "12-34"; instance ids keep their ";" parts readable). */
export const safe = (id: string) => id.replace(/:/g, '-').replace(/;/g, '_');
