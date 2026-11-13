import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { LoadedConfig } from '../config.ts';
import { FigmaHttpError, type FigmaReader } from '../figma/client.ts';
import type { FigmaNode } from '../figma/types.ts';
import { readJson } from '../util/core.ts';
import { buildComponentSet, emptyVariables, variablesFromExport } from './build.ts';
import type { FigmaIR, IRVariable } from './types.ts';

const norm = (s: string) => s.trim().toLowerCase();

function findPage(doc: FigmaNode, name: string): FigmaNode | undefined {
  return (doc.children ?? []).find((p) => p.type === 'CANVAS' && norm(p.name) === norm(name));
}

function findSet(page: FigmaNode | undefined, doc: FigmaNode, id: string, name: string): { node: FigmaNode; note?: string } | undefined {
  const pages = page ? [page, ...(doc.children ?? []).filter((p) => p !== page)] : doc.children ?? [];
  for (const p of pages) for (const n of p.children ?? []) if (n.id === id) return { node: n };
  for (const p of pages) {
    for (const n of p.children ?? []) {
      if (n.type === 'COMPONENT_SET' && norm(n.name) === norm(name)) {
        return { node: n, note: `Pinned id ${id} not found; matched component set by name "${name}" (${n.id}) on page "${p.name}".` };
      }
    }
  }
  return undefined;
}

async function loadVariables(client: FigmaReader, config: LoadedConfig, log: (m: string) => void): Promise<FigmaIR['variables']> {
  try {
    const res = await client.localVariables(config.figma.fileKey);
    const collections = res.meta.variableCollections;
    const byId: Record<string, IRVariable> = {};
    const byName: Record<string, IRVariable> = {};
    for (const v of Object.values(res.meta.variables)) {
      const css = v.codeSyntax?.WEB ? /var\((--[\w-]+)\)/.exec(v.codeSyntax.WEB)?.[1] : undefined;
      const entry: IRVariable = { name: v.name, collection: collections[v.variableCollectionId]?.name ?? v.variableCollectionId };
      if (css) entry.cssVar = css;
      byId[v.id] = entry;
      byName[v.name] = entry;
    }
    return { source: 'rest', byId, byName };
  } catch (err) {
    if (!(err instanceof FigmaHttpError) || (err.status !== 403 && err.status !== 404)) throw err;
    const exportPath = config.repo?.figmaVariables ? join(config.repoDir, config.repo.figmaVariables) : undefined;
    if (exportPath && existsSync(exportPath)) {
      log(`Variables REST API unavailable (HTTP ${err.status}, Enterprise only); using ${config.repo?.figmaVariables}.`);
      return {
        source: 'export',
        note: `Variables REST API returned ${err.status}. Names come from the repo export; bound variable ids cannot be resolved to names.`,
        byId: {},
        byName: variablesFromExport(readJson(exportPath)),
      };
    }
    log(`Variables API unavailable (HTTP ${err.status}, Enterprise only): bound variables are matched to tokens by value.`);
    return { ...emptyVariables(), note: `Variables REST API returned ${err.status}; no export configured.` };
  }
}

export async function extractIR(client: FigmaReader, config: LoadedConfig, log: (m: string) => void = () => {}, version?: string): Promise<FigmaIR> {
  const fileKey = config.figma.fileKey;
  const file = await client.file(fileKey, 2, version);
  log(`Figma file "${file.name}", version ${file.version}`);

  const missing: FigmaIR['missing'] = [];
  const plan: { targetIndex: number; setId: string; docIds: string[]; notes: string[] }[] = [];

  config.components.forEach((target, targetIndex) => {
    const page = findPage(file.document, target.figma.page);
    const known = file.componentSets?.[target.figma.componentSet.id];
    // Nested sets (inside frames or sections) are not visible at depth 2, but the file's set map lists them.
    // Sets deep inside frames (found by discovery) are not visible at depth 2: fetch them by their id; the nodes
    // request below reports them missing if Figma has no such node.
    const found = findSet(page, file.document, target.figma.componentSet.id, target.figma.componentSet.name)
      ?? (target.figma.componentSet.id ? { node: { id: target.figma.componentSet.id, name: known?.name ?? target.figma.componentSet.name, type: 'COMPONENT_SET' } as FigmaNode } : undefined);
    if (!found) {
      missing.push({ targetId: target.id, reason: `Component set "${target.figma.componentSet.name}" (${target.figma.componentSet.id}) not found on any page.` });
      return;
    }
    const notes = found.note ? [found.note] : [];
    if (!page) notes.push(`Page "${target.figma.page}" not found by name.`);
    let docIds = target.figma.docFrames ?? [];
    if (docIds.length === 0 && page) {
      docIds = (page.children ?? []).filter((n) => n.type === 'FRAME' && /documentation/i.test(n.name)).map((n) => n.id);
      if (docIds.length) notes.push(`Doc frames auto-detected by name: ${docIds.join(', ')}.`);
    }
    plan.push({ targetIndex, setId: found.node.id, docIds, notes });
  });

  const ids = [...new Set(plan.flatMap((p) => [p.setId, ...p.docIds]))];
  const nodes: Record<string, FigmaNode> = {};
  const componentNames: Record<string, string> = {};
  const setKeys: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const res = await client.nodes(fileKey, chunk, file.version);
    for (const [id, entry] of Object.entries(res.nodes)) {
      if (!entry) continue;
      nodes[id] = entry.document;
      for (const [cid, c] of Object.entries(entry.components ?? {})) componentNames[cid] = c.name;
      for (const [sid, s] of Object.entries(entry.componentSets ?? {})) setKeys[sid] = s.key;
    }
  }

  const variables = await loadVariables(client, config, log);
  const resolve = (id: string | null) => (id ? variables.byId[id]?.name : undefined);

  const components = plan.flatMap((p) => {
    const target = config.components[p.targetIndex]!;
    const set = nodes[p.setId];
    if (!set) {
      missing.push({ targetId: target.id, reason: `Component set "${target.figma.componentSet.name}" (${p.setId}) not found in the file.` });
      return [];
    }
    const docFrames = p.docIds.map((id) => nodes[id]).filter((n): n is FigmaNode => Boolean(n));
    const absentDocs = p.docIds.filter((id) => !nodes[id]);
    if (absentDocs.length) p.notes.push(`Doc frames not found: ${absentDocs.join(', ')}.`);
    const key = setKeys[p.setId];
    return [buildComponentSet({ target, set, ...(key ? { key } : {}), docFrames, componentNames, resolve, notes: p.notes })];
  });

  return {
    irVersion: 1,
    fileKey,
    fileName: file.name,
    version: file.version,
    lastModified: file.lastModified,
    variables,
    components,
    missing,
  };
}
