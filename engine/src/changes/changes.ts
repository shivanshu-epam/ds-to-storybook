/**
 * What changed in Figma between two versions, in words a reviewer can check: per component, the
 * properties (API), the variants, and the visual values (colours, sizes, radii, text) that differ.
 * Used as the pull request description by the GitHub workflow.
 */
import type { FigmaIR, IRComponentSet, IRPart, IRStyle, IRValue, IRVariant } from '../ir/types.ts';

export type ChangeKind = 'added' | 'removed' | 'api' | 'variants' | 'styles' | 'content' | 'docs';

export interface ComponentChange {
  component: string;
  kinds: ChangeKind[];
  lines: string[];
  /** Variants whose look changed (node ids in the new version), for before/after images. */
  changedVariants: { nodeId: string; name: string }[];
}

export interface ChangeSet {
  fileKey: string;
  fileName: string;
  from: string;
  to: string;
  components: ComponentChange[];
  /** GitHub labels for the pull request. */
  labels: string[];
}

const LABELS: Record<ChangeKind, string> = { added: 'components', removed: 'components', api: 'component-api', variants: 'components', styles: 'styles', content: 'content', docs: 'docs' };

const val = (v: IRValue<string> | IRValue<number> | undefined) => (v === undefined ? undefined : v.variableName ? `${v.value} (${v.variableName})` : String(v.value));

/** The visual values of one node, as name -> printable value. */
function look(s: IRStyle, part?: IRPart): Record<string, string | undefined> {
  return {
    fill: val(s.fills[0]),
    stroke: val(s.strokes[0]),
    'stroke width': s.strokes.length ? val(s.strokeWeight) : undefined,
    dashes: s.dashes?.join(' '),
    radius: val(s.cornerRadius),
    padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].some(Boolean) ? [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((p) => p?.value ?? 0).join(' ') : undefined,
    gap: val(s.itemSpacing),
    width: s.sizingH === 'FIXED' || !s.sizingH ? s.width?.toString() : undefined,
    height: s.sizingV === 'FIXED' || !s.sizingV ? s.height?.toString() : undefined,
    layout: s.layoutMode,
    opacity: s.opacity?.toString(),
    shadow: s.shadows?.join(', '),
    font: s.text ? [s.text.fontFamily, s.text.fontSize, s.text.fontWeight, s.text.lineHeightPx].filter(Boolean).join(' / ') : undefined,
    text: part?.text,
    icon: part?.instanceOf,
    hidden: part?.hidden ? 'yes' : undefined,
  };
}

const CONTENT = new Set(['text']);

function variantDiff(a: IRVariant, b: IRVariant): { key: string; kind: ChangeKind }[] {
  const out: { key: string; kind: ChangeKind }[] = [];
  const cmp = (where: string, x: Record<string, string | undefined>, y: Record<string, string | undefined>) => {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (x[k] !== y[k]) out.push({ key: `${where}${k}: ${x[k] ?? '—'} → ${y[k] ?? '—'}`, kind: CONTENT.has(k) ? 'content' : 'styles' });
    }
  };
  cmp('', look(a.style), look(b.style));
  const id = (p: IRPart) => `${p.path}|${p.type}`;
  const before = new Map(a.parts.map((p) => [id(p), p]));
  const after = new Map(b.parts.map((p) => [id(p), p]));
  for (const [k, p] of after) {
    const q = before.get(k);
    if (!q) out.push({ key: `layer "${p.path}" added`, kind: 'styles' });
    else cmp(`"${p.path}" `, look(q.style, q), look(p.style, p));
  }
  for (const [k, p] of before) if (!after.has(k)) out.push({ key: `layer "${p.path}" removed`, kind: 'styles' });
  return out;
}

function setDiff(component: string, a: IRComponentSet, b: IRComponentSet): ComponentChange | undefined {
  const kinds = new Set<ChangeKind>();
  const lines: string[] = [];
  const changed = new Map<string, { nodeId: string; name: string }>();

  // Properties: the component's API.
  const props = (s: IRComponentSet) => new Map(s.properties.map((p) => [p.name, p]));
  const pa = props(a);
  const pb = props(b);
  for (const [n, p] of pb) {
    const q = pa.get(n);
    if (!q) lines.push(`Property **${n}** added (${p.type.toLowerCase()}${p.options ? `: ${p.options.join(', ')}` : ''}).`);
    else {
      const added = (p.options ?? []).filter((o) => !(q.options ?? []).includes(o));
      const removed = (q.options ?? []).filter((o) => !(p.options ?? []).includes(o));
      if (added.length) lines.push(`Property **${n}**: option${added.length > 1 ? 's' : ''} ${added.join(', ')} added.`);
      if (removed.length) lines.push(`Property **${n}**: option${removed.length > 1 ? 's' : ''} ${removed.join(', ')} removed.`);
      if (String(q.default) !== String(p.default)) lines.push(`Property **${n}**: default ${String(q.default)} → ${String(p.default)}.`);
      if (!added.length && !removed.length && String(q.default) === String(p.default)) continue;
    }
    kinds.add('api');
  }
  for (const n of pa.keys()) if (!pb.has(n)) { lines.push(`Property **${n}** removed.`); kinds.add('api'); }

  // Variants, matched by node id (stable across renames), then by name.
  const byId = new Map(a.variants.map((v) => [v.nodeId, v]));
  const byName = new Map(a.variants.map((v) => [v.name, v]));
  const groups = new Map<string, { kind: ChangeKind; variants: string[] }>();
  const addedVariants: string[] = [];
  for (const v of b.variants) {
    const old = byId.get(v.nodeId) ?? byName.get(v.name);
    if (!old) { addedVariants.push(v.name); changed.set(v.nodeId, { nodeId: v.nodeId, name: v.name }); continue; }
    for (const d of variantDiff(old, v)) {
      const g = groups.get(d.key) ?? { kind: d.kind, variants: [] };
      g.variants.push(v.name);
      groups.set(d.key, g);
      changed.set(v.nodeId, { nodeId: v.nodeId, name: v.name });
    }
  }
  const removedVariants = a.variants.filter((v) => !b.variants.some((x) => x.nodeId === v.nodeId || x.name === v.name)).map((v) => v.name);
  if (addedVariants.length) { lines.push(`${addedVariants.length} variant${addedVariants.length > 1 ? 's' : ''} added: ${list(addedVariants)}.`); kinds.add('variants'); }
  if (removedVariants.length) { lines.push(`${removedVariants.length} variant${removedVariants.length > 1 ? 's' : ''} removed: ${list(removedVariants)}.`); kinds.add('variants'); }
  for (const [key, g] of [...groups].sort((x, y) => y[1].variants.length - x[1].variants.length)) {
    const where = g.variants.length === b.variants.length ? 'all variants' : g.variants.length === 1 ? g.variants[0]! : `${g.variants.length} of ${b.variants.length} variants (${list(g.variants)})`;
    lines.push(`${where}: ${key.replace(/^(.*?): (.*) → (.*)$/, (_m, k: string, x: string, y: string) => `${k} \`${x}\` → \`${y}\``)}.`);
    kinds.add(g.kind);
  }
  const doc = docsDiff(a, b);
  if (doc) { lines.push(doc); kinds.add('docs'); }
  if (a.description !== b.description) { lines.push(`Description: "${a.description}" → "${b.description}".`); kinds.add('docs'); }
  if (!lines.length) return undefined;
  return { component, kinds: [...kinds], lines, changedVariants: [...changed.values()] };
}

/** Documentation frames compared by name, text only (Figma node ids change when text is edited). */
function docsDiff(a: IRComponentSet, b: IRComponentSet): string | undefined {
  const texts = (s: IRComponentSet) => new Map(s.docFrames.map((f) => [f.name, f.blocks.map((x) => x.text)]));
  const ta = texts(a);
  const tb = texts(b);
  const added = [...tb.keys()].filter((n) => !ta.has(n));
  const removed = [...ta.keys()].filter((n) => !tb.has(n));
  const edited = [...tb].filter(([n, t]) => ta.has(n) && JSON.stringify(ta.get(n)) !== JSON.stringify(t)).map(([n, t]) => {
    const before = new Set(ta.get(n));
    const after = new Set(t);
    const changes = t.filter((x) => !before.has(x)).length + ta.get(n)!.filter((x) => !after.has(x)).length;
    return `"${n}" (${changes} text change${changes === 1 ? '' : 's'})`;
  });
  const parts = [
    ...(added.length ? [`added ${added.map((n) => `"${n}"`).join(', ')}`] : []),
    ...(removed.length ? [`removed ${removed.map((n) => `"${n}"`).join(', ')}`] : []),
    ...(edited.length ? [`edited ${edited.join(', ')}`] : []),
  ];
  return parts.length ? `Documentation: ${parts.join('; ')}.` : undefined;
}

function list(names: string[], max = 4): string {
  return names.length <= max ? names.join('; ') : `${names.slice(0, max).join('; ')}; and ${names.length - max} more`;
}

/** Diff two IRs. names maps a set's node id to its generated component name. */
export function diffIR(before: FigmaIR, after: FigmaIR, names: Record<string, string>): ChangeSet {
  const components: ComponentChange[] = [];
  const old = new Map(before.components.map((s) => [s.nodeId, s]));
  for (const s of after.components) {
    const name = names[s.nodeId] ?? s.name;
    const prev = old.get(s.nodeId);
    if (!prev) { components.push({ component: name, kinds: ['added'], lines: [`New component set "${s.name}" (${s.variants.length} variants).`], changedVariants: s.variants.map((v) => ({ nodeId: v.nodeId, name: v.name })) }); continue; }
    if (prev.hash === s.hash) continue;
    const c = setDiff(name, prev, s);
    if (c) components.push(c);
  }
  for (const s of before.components) {
    if (!after.components.some((x) => x.nodeId === s.nodeId)) components.push({ component: names[s.nodeId] ?? s.name, kinds: ['removed'], lines: [`Component set "${s.name}" removed from Figma.`], changedVariants: [] });
  }
  // A component built from several sets (Checkbox control + field + group) is reported once.
  const merged = new Map<string, ComponentChange>();
  for (const c of components) {
    const m = merged.get(c.component);
    if (!m) merged.set(c.component, { ...c, kinds: [...c.kinds], lines: [...c.lines] });
    else { m.kinds = [...new Set([...m.kinds, ...c.kinds])]; m.lines = [...new Set([...m.lines, ...c.lines])]; m.changedVariants.push(...c.changedVariants); }
  }
  const out = [...merged.values()];
  return { fileKey: after.fileKey, fileName: after.fileName, from: before.version, to: after.version, components: out, labels: [...new Set(out.flatMap((c) => c.kinds.map((k) => LABELS[k])))].sort() };
}

/** Markdown for the pull request description. */
export function changesMarkdown(c: ChangeSet, extra: { images?: string; tests?: string } = {}): string {
  const figma = `https://www.figma.com/design/${c.fileKey}`;
  if (!c.components.length) {
    return `## Figma changes\n\n[${c.fileName}](${figma}) moved from version ${c.from} to ${c.to}, with no changes to the components ds-sync generates.\n`;
  }
  return `## Figma changes

[${c.fileName}](${figma}): version ${c.from} → ${c.to}. ${c.components.length} component${c.components.length > 1 ? 's' : ''} changed: ${c.components.map((x) => `**${x.component}** (${x.kinds.join(', ')})`).join(', ')}.

${c.components.map((x) => `### ${x.component}\n\n${x.lines.map((l) => `- ${l}`).join('\n')}`).join('\n\n')}
${extra.images ? `\n${extra.images}\n` : ''}${extra.tests ? `\n${extra.tests}\n` : ''}
---
Generated by ds-sync. Review the code diff for these components; \`GENERATION-REPORT.md\` lists what Figma does not specify.
`;
}

export interface ImageSource {
  images(fileKey: string, ids: string[], format: 'svg' | 'png', version?: string, scale?: number): Promise<{ images: Record<string, string | null> }>;
  fetchBinary(url: string): Promise<Buffer>;
}

/**
 * Figma's own renders of the changed variants at both versions, side by side (changes.html).
 * Capped so a large change cannot exhaust the API rate limit; the page says when it was capped.
 */
export async function changeImages(source: ImageSource, c: ChangeSet, outDir: string, write: (path: string, data: Buffer | string) => void, max = 40): Promise<number> {
  const all = c.components.flatMap((x) => x.changedVariants.map((v) => ({ ...v, component: x.component })));
  const picked = all.slice(0, max);
  if (!picked.length) return 0;
  const ids = picked.map((v) => v.nodeId);
  const render = async (version: string) => {
    const urls: Record<string, string | null> = {};
    for (let i = 0; i < ids.length; i += 50) Object.assign(urls, (await source.images(c.fileKey, ids.slice(i, i + 50), 'png', version, 2)).images);
    return urls;
  };
  const [before, after] = await Promise.all([render(c.from), render(c.to)]);
  const rows: string[] = [];
  for (const v of picked) {
    const file = v.nodeId.replace(/[^\w-]/g, '_');
    const cell = async (urls: Record<string, string | null>, side: string) => {
      const url = urls[v.nodeId];
      if (!url) return '<td class="none">not in this version</td>';
      write(`${outDir}/${file}-${side}.png`, await source.fetchBinary(url));
      return `<td><img src="${file}-${side}.png" alt="${side}"></td>`;
    };
    rows.push(`<tr><td><b>${esc(v.component)}</b><br>${esc(v.name)}</td>${await cell(before, 'before')}${await cell(after, 'after')}</tr>`);
  }
  write(`${outDir}/changes.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Figma changes</title>
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#111;--line:#ddd}@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--line:#333}}
body{margin:0;padding:24px 16px;font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}.wrap{overflow-x:auto}table{border-collapse:collapse}td,th{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}img{max-width:420px;background:#fff;border:1px solid var(--line)}.none{opacity:.6}</style></head><body>
<h1>Figma changes: before and after</h1><p>${esc(c.fileName)}, version ${esc(c.from)} → ${esc(c.to)}. Figma's own renders of the variants that changed${all.length > max ? ` (the first ${max} of ${all.length})` : ''}.</p>
<div class="wrap"><table><thead><tr><th>Variant</th><th>Before</th><th>After</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></body></html>
`);
  return picked.length;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
