import type { FigmaRenderer } from '../figma/client.ts';
import type { FigmaIR } from '../ir/types.ts';

export interface IconAsset {
  /** Figma component name, e.g. "Icon/form/check/20". */
  figmaName: string;
  /** Export name in code, e.g. "formCheck20". */
  name: string;
  nodeId: string;
  /** SVG markup with colours replaced by currentColor. */
  svg: string;
}

export function iconExportName(figmaName: string): string {
  const parts = figmaName.replace(/^Icon\//i, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1))).join('');
}

/** Monochrome icons: every solid colour becomes currentColor so CSS `color` drives them. Scripts and handlers are removed. */
export function normalizeSvg(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/(fill|stroke)="(?!none)(#[0-9a-fA-F]{3,8}|black|white|rgb[^"]*)"/g, '$1="currentColor"')
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
    .replace(/<svg/, '<svg width="100%" height="100%" aria-hidden="true" focusable="false"')
    .trim();
}

/** Every icon instance referenced by the given component sets (hidden optional parts included). */
export function iconRefs(ir: FigmaIR, targetIds: string[]): Map<string, string> {
  const refs = new Map<string, string>();
  for (const set of ir.components.filter((c) => targetIds.includes(c.targetId))) {
    for (const v of set.variants) {
      for (const p of v.parts) {
        if (p.type === 'INSTANCE' && p.instanceComponentId && p.instanceOf && (p.icon || /^icons?\//i.test(p.instanceOf))) refs.set(p.instanceComponentId, p.instanceOf);
        for (const i of p.innerIcons ?? []) refs.set(i.componentId, i.name);
      }
    }
  }
  return refs;
}

export async function exportIcons(renderer: FigmaRenderer, ir: FigmaIR, refs: Map<string, string>): Promise<IconAsset[]> {
  if (refs.size === 0) return [];
  const ids = [...refs.keys()];
  const { images } = await renderer.images(ir.fileKey, ids, 'svg', ir.version);
  const out: IconAsset[] = [];
  for (const id of ids) {
    const url = images[id];
    const figmaName = refs.get(id)!;
    if (!url) continue;
    out.push({ figmaName, name: iconExportName(figmaName), nodeId: id, svg: normalizeSvg(await renderer.fetchText(url)) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Colours an SVG paints with (fills and strokes, gradients as "url"). */
export function svgColors(svg: string): Set<string> {
  const out = new Set<string>();
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)) if (m[1] !== 'none') out.add(m[1]!.startsWith('url(') ? 'url' : m[1]!.toLowerCase());
  return out;
}

/** SVG as a CSS data: URI. */
export const svgUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg.replace(/<\?xml[^>]*>/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ').trim())}`;

/**
 * Exports the outline of every vector shape (vectors, boolean operations, stars, polygons) in the given sets that is not
 * a group around icons, once per layer and size, and stores it on the parts (part.shape). Returns how many were exported.
 */
export async function exportShapes(renderer: FigmaRenderer, ir: FigmaIR, targetIds: string[], log: (m: string) => void): Promise<number> {
  const keyOf = (setId: string, p: { path: string; style: { width?: number; height?: number } }) => `${setId}|${p.path}|${p.style.width ?? 0}x${p.style.height ?? 0}`;
  const pick = new Map<string, string>();
  const sets = ir.components.filter((c) => targetIds.includes(c.targetId));
  for (const set of sets) for (const v of set.variants) for (const p of v.parts) {
    if (!p.nodeId || v.parts.some((c) => c.parent === p.path && c.type === 'INSTANCE')) continue;
    const k = keyOf(set.targetId, p);
    if (!pick.has(k)) pick.set(k, p.nodeId);
  }
  if (!pick.size) return 0;
  const ids = [...new Set(pick.values())];
  const svgs = new Map<string, { uri: string; mono: boolean }>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const { images } = await renderer.images(ir.fileKey, chunk, 'svg', ir.version);
      for (const id of chunk) {
        const url = images[id];
        if (!url) continue;
        const svg = await renderer.fetchText(url);
        svgs.set(id, { uri: svgUri(svg), mono: svgColors(svg).size <= 1 });
      }
    } catch (e) {
      log(`Shapes: export failed for ${chunk.length} layers (${(e as Error).message}); they stay approximated as boxes.`);
    }
  }
  let applied = 0;
  for (const set of sets) {
    const byPath = new Map<string, { uri: string; mono: boolean }>();
    for (const [k, id] of pick) if (k.startsWith(`${set.targetId}|`) && svgs.has(id)) byPath.set(k.split('|')[1]!, svgs.get(id)!);
    for (const v of set.variants) for (const p of v.parts) {
      if (!p.nodeId) continue;
      const shape = svgs.get(pick.get(keyOf(set.targetId, p)) ?? '') ?? byPath.get(p.path);
      if (shape) { p.shape = shape; applied++; }
    }
  }
  log(`Shapes: ${svgs.size} vector outlines exported as SVG (${applied} layers)`);
  return svgs.size;
}
