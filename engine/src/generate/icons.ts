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
        if (p.type === 'INSTANCE' && p.instanceComponentId && p.instanceOf && /^icon\//i.test(p.instanceOf)) refs.set(p.instanceComponentId, p.instanceOf);
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
