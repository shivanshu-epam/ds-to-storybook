/**
 * Discovery: find every component set in a Figma file, classify every top-level frame,
 * and propose which generated component each set becomes and which template builds it.
 *
 * Rules first; anything below the confidence threshold is listed for a person to confirm
 * (the Claude Skill in Phase B asks these questions). Nothing here needs node ids in config.
 */
import type { ComponentTarget } from '../config.ts';
import type { FigmaReader } from '../figma/client.ts';
import type { FigmaNode, FileResponse } from '../figma/types.ts';
import { looseKey } from '../util/core.ts';

export type FrameKind = 'documentation' | 'example' | 'page-text' | 'other';
export type PageKind = 'components' | 'icons' | 'parts' | 'patterns' | 'skip' | 'empty';

export interface DiscoveredSet {
  id: string;
  name: string;
  key?: string;
  page: string;
  /** Ancestor frames between the page and the set (nested sets). */
  path: string[];
}

export interface DiscoveredFrame {
  id: string;
  name: string;
  page: string;
  kind: FrameKind;
  confidence: number;
  reason: string;
}

export interface Proposal {
  /** Generated component name (PascalCase). */
  name: string;
  template: 'action' | 'checkbox' | 'accordion' | 'switch' | 'radio' | 'radio-field' | 'radio-group' | 'input' | 'dialog' | 'generic';
  /** Template role -> component set id. */
  sets: Record<string, string>;
  page: string;
  docFrames: string[];
  confidence: number;
  reason: string;
}

export interface Discovery {
  fileKey: string;
  fileName: string;
  version: string;
  pages: { name: string; kind: PageKind; reason: string; sets: number; frames: number; standaloneComponents: number }[];
  sets: DiscoveredSet[];
  frames: DiscoveredFrame[];
  proposals: Proposal[];
  /** Items below the confidence threshold, for a person to confirm. */
  review: { item: string; question: string; current: string }[];
}

export interface Overrides {
  /** Set name or id -> override. */
  sets?: Record<string, { exclude?: boolean; name?: string; template?: Proposal['template'] }>;
  /** Frame id -> kind. */
  frames?: Record<string, FrameKind>;
  /** Page names to skip entirely. */
  skipPages?: string[];
  /**
   * Accepted design issues, by component name, e.g. {"Input": "Placeholder contrast 4.39:1 on Filled; fix in Figma"}.
   * Their accessibility checks are reported as warnings (todo) instead of failing, and the reason is shown in the docs.
   */
  /**
   * Accepted design issues by component: their axe checks report instead of failing.
   * A string applies to every Figma mode. An object applies per mode: keys like "theme=dark"
   * (several as "theme=dark project=project-b"), or "default" for the default modes.
   */
  knownIssues?: Record<string, string | Record<string, string>>;
}

const REVIEW_THRESHOLD = 0.7;
const DOC_NAME = /documentation|\bdocs?\b|usage|guideline|anatomy|\bspecs?\b|accessibility|do'?s|don'?t|handoff|how to read|overview|token map|redlines?/i;
const EXAMPLE_NAME = /example|demo|playground|showcase|preview|use ?case|pattern|instances?/i;
const SKIP_PAGE = /\b(qa|test|tests|archive|archived|deprecated|playground|cover|scratch|sandbox|wip)\b/i;

export const pascalName = (s: string) => {
  const p = s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return /^[0-9]/.test(p) ? `C${p}` : p || 'Component';
};

/** Counts node types below a frame (two levels), to tell prose from live examples. */
function contentProfile(node: FigmaNode, depth = 0, acc = { text: 0, instance: 0, other: 0 }) {
  for (const c of node.children ?? []) {
    if (c.type === 'TEXT') acc.text++;
    else if (c.type === 'INSTANCE') acc.instance++;
    else acc.other++;
    if (depth < 2 && c.type !== 'INSTANCE') contentProfile(c, depth + 1, acc);
  }
  return acc;
}

export function classifyFrame(node: FigmaNode, detail?: FigmaNode): { kind: FrameKind; confidence: number; reason: string } {
  if (node.type === 'TEXT') return { kind: 'page-text', confidence: 0.9, reason: 'Top-level text (page title or description).' };
  if (DOC_NAME.test(node.name)) return { kind: 'documentation', confidence: 0.9, reason: `Name "${node.name}" matches documentation vocabulary.` };
  if (EXAMPLE_NAME.test(node.name)) return { kind: 'example', confidence: 0.85, reason: `Name "${node.name}" matches example vocabulary.` };
  if (node.type === 'INSTANCE') return { kind: 'example', confidence: 0.75, reason: 'A loose instance on the page.' };
  if (detail) {
    const p = contentProfile(detail);
    const total = p.text + p.instance + p.other || 1;
    if (p.text / total >= 0.5 && p.text >= 5) return { kind: 'documentation', confidence: 0.75, reason: `Mostly text (${p.text} of ${total} layers).` };
    if (p.instance / total >= 0.4) return { kind: 'example', confidence: 0.7, reason: `Mostly instances (${p.instance} of ${total} layers).` };
    return { kind: 'other', confidence: 0.4, reason: `Mixed content (${p.text} text, ${p.instance} instances, ${p.other} other).` };
  }
  return { kind: 'other', confidence: 0.3, reason: 'No name or content signal.' };
}

function classifyPage(page: FigmaNode, setsOnPage: number, overrides: Overrides): { kind: PageKind; reason: string } {
  const children = page.children ?? [];
  if (overrides.skipPages?.some((p) => looseKey(p) === looseKey(page.name))) return { kind: 'skip', reason: 'Skipped by overrides.' };
  if (SKIP_PAGE.test(page.name)) return { kind: 'skip', reason: `Page name "${page.name}" looks like a working or QA page.` };
  const comps = children.filter((c) => c.type === 'COMPONENT');
  if (comps.length >= 10 && comps.filter((c) => /^icons?\//i.test(c.name)).length / comps.length > 0.5) return { kind: 'icons', reason: `${comps.length} standalone icon components.` };
  if (setsOnPage > 0) return { kind: 'components', reason: `${setsOnPage} component set(s).` };
  if (comps.length) return { kind: 'parts', reason: `${comps.length} standalone components (no sets): treated as building blocks.` };
  if (children.length) return { kind: 'patterns', reason: 'Frames only, no component sets: patterns or compositions.' };
  return { kind: 'empty', reason: 'Empty page.' };
}

/** Sets that share a base name on one page (CheckboxControl / CheckboxField / CheckboxGroup -> Checkbox). */
function baseName(name: string): { base: string; suffix: string } {
  const m = /^(.*?)(Control|Field|Group|Item|Trigger|Menu)$/.exec(name.replace(/\s+/g, ''));
  return m && m[1] ? { base: m[1], suffix: m[2]! } : { base: name.replace(/\s+/g, ''), suffix: '' };
}

/** A variant property with exactly two options that read as off/on. */
function hasOnOffAxis(node?: FigmaNode): boolean {
  const defs = Object.values(node?.componentPropertyDefinitions ?? {}) as { type?: string; variantOptions?: string[] }[];
  return defs.some((d) => d.type === 'VARIANT' && d.variantOptions?.length === 2 && /^(off|false|unchecked|unselected|inactive)$/i.test(d.variantOptions.find((o) => /^(off|false|unchecked|unselected|inactive)$/i.test(o)) ?? '') && d.variantOptions.some((o) => /^(on|true|checked|selected|active)$/i.test(o)));
}

function propose(sets: DiscoveredSet[], nodes: Map<string, FigmaNode>, overrides: Overrides): Proposal[] {
  const out: Proposal[] = [];
  const claimed = new Set<string>();
  const byPage = new Map<string, DiscoveredSet[]>();
  for (const s of sets) byPage.set(s.page, [...(byPage.get(s.page) ?? []), s]);
  const layerNames = (id: string) => {
    const names = new Set<string>();
    const walk = (n: FigmaNode) => { names.add(n.name); if (n.type !== 'INSTANCE') n.children?.forEach(walk); };
    nodes.get(id)?.children?.forEach(walk);
    return names;
  };
  const props = (id: string) => Object.keys(nodes.get(id)?.componentPropertyDefinitions ?? {}).map((k) => k.replace(/#[\d:]+$/, ''));

  for (const [page, list] of byPage) {
    // Checkbox archetype: Control + Field (+ Group) with a box and a mark layer.
    const groups = new Map<string, Record<string, DiscoveredSet>>();
    for (const s of list) {
      const { base, suffix } = baseName(s.name);
      if (suffix) groups.set(base, { ...(groups.get(base) ?? {}), [suffix.toLowerCase()]: s });
    }
    for (const [base, g] of groups) {
      if (/checkbox/i.test(base) && g.control && g.field && layerNames(g.control.id).has('_box') && layerNames(g.control.id).has('_mark')) {
        const sets: Record<string, string> = { control: g.control.id, field: g.field.id };
        if (g.group) sets.group = g.group.id;
        Object.values(sets).forEach((id) => claimed.add(id));
        out.push({ name: pascalName(base), template: 'checkbox', sets, page, docFrames: [], confidence: 0.9, reason: 'Checkbox control, field and group sets with _box/_mark layers: checkbox archetype.' });
      }
    }
    // Radio archetype: a control with a selected axis, plus optional field and group sets. Each stays its own component.
    const radioOf = new Map<string, Proposal['template']>();
    for (const [base, g] of groups) {
      if (!/radio/i.test(base) || !g.control || !hasOnOffAxis(nodes.get(g.control.id))) continue;
      radioOf.set(g.control.id, 'radio');
      if (g.field) radioOf.set(g.field.id, 'radio-field');
      if (g.group) radioOf.set(g.group.id, 'radio-group');
    }
    for (const s of list) {
      if (claimed.has(s.id)) continue;
      const names = layerNames(s.id);
      const p = props(s.id);
      let template: Proposal['template'] = 'generic';
      let reason = 'No archetype template matches; generic template renders the Figma layers (visuals only, behaviour not specified).';
      let confidence = 0.8;
      const radioTemplate = radioOf.get(s.id);
      if (radioTemplate) {
        template = radioTemplate;
        reason = radioTemplate === 'radio' ? 'Radio control with a selected axis: radio archetype (native radio, WAI-ARIA radio group).' : radioTemplate === 'radio-field' ? 'Radio field: the row with the radio becomes its <label>.' : 'Radio group: role="radiogroup" with a shared name and value.';
        confidence = 0.85;
      } else if (/^button$/i.test(s.name) && p.includes('Variant') && p.some((x) => /^state$/i.test(x))) {
        template = 'action';
        reason = 'Named Button with Variant and State axes: action archetype (WAI-ARIA button).';
        confidence = 0.9;
      } else if (/accordion/i.test(s.name) && names.has('_header') && names.has('_panel')) {
        template = 'accordion';
        reason = 'Accordion item with _header and _panel layers: disclosure archetype (WAI-ARIA accordion).';
        confidence = 0.9;
      } else if (/dialog|modal/i.test(s.name)) {
        template = 'dialog';
        reason = 'Dialog or modal: dialog archetype (native <dialog>, WAI-ARIA dialog pattern).';
        confidence = 0.85;
      } else if (/input|text ?field|text ?box/i.test(s.name) && p.some((x) => /placeholder/i.test(x))) {
        template = 'input';
        reason = 'Text input with a Placeholder property: input archetype (native <input> with label and description).';
        confidence = 0.85;
      } else if (/switch|toggle/i.test(s.name) && hasOnOffAxis(nodes.get(s.id))) {
        template = 'switch';
        reason = 'Switch or toggle with an on/off variant axis: switch archetype (WAI-ARIA switch).';
        confidence = 0.85;
      } else if (/button|accordion|checkbox|radio|switch|tab|dialog|modal|menu|select|dropdown|input|slider/i.test(s.name)) {
        confidence = 0.6;
        reason += ' The name suggests an interactive component, so behaviour must be specified before production use.';
      }
      // Specialised templates name the whole component (an "AccordionItem" set builds Accordion + AccordionItem).
      const name = template === 'accordion' ? pascalName(s.name.replace(/\s*item$/i, '')) : pascalName(s.name);
      out.push({ name, template, sets: template === 'accordion' ? { item: s.id } : { main: s.id }, page, docFrames: [], confidence, reason });
    }
  }

  // Overrides and unique names.
  const final: Proposal[] = [];
  const used = new Set<string>();
  for (const p of out) {
    const firstSet = sets.find((s) => s.id === Object.values(p.sets)[0]);
    const o = overrides.sets?.[p.name] ?? (firstSet ? overrides.sets?.[firstSet.name] ?? overrides.sets?.[firstSet.id] : undefined);
    if (o?.exclude) continue;
    const name = o?.name ?? p.name;
    let unique = name;
    for (let i = 2; used.has(unique); i++) unique = `${name}${i}`;
    used.add(unique);
    final.push({ ...p, name: unique, ...(o?.template ? { template: o.template, reason: `${p.reason} Template overridden to ${o.template}.` } : {}) });
  }
  return final;
}

/** `version`: a Figma version id to read instead of the latest (reproducible runs). */
export async function discover(client: FigmaReader, fileKey: string, overrides: Overrides = {}, log: (m: string) => void = () => {}, version?: string): Promise<Discovery> {
  const file: FileResponse = await client.file(fileKey, 2, version);
  const allSets = file.componentSets ?? {};
  const pages = (file.document.children ?? []).filter((p) => p.type === 'CANVAS');

  // Where each set lives. Top-level sets are visible at depth 2; nested ones need their ancestors.
  const located = new Map<string, { page: string; path: string[] }>();
  for (const page of pages) for (const c of page.children ?? []) if (c.type === 'COMPONENT_SET') located.set(c.id, { page: page.name, path: [] });
  const nestedIds = Object.keys(allSets).filter((id) => !located.has(id));
  const fullNodes = new Map<string, FigmaNode>();
  if (nestedIds.length) {
    const res = await client.fileWithIds(fileKey, nestedIds, file.version);
    const walk = (n: FigmaNode, page: string, path: string[]) => {
      if (n.type === 'COMPONENT_SET' && allSets[n.id]) {
        located.set(n.id, { page, path });
        fullNodes.set(n.id, n);
        return;
      }
      for (const c of n.children ?? []) walk(c, n.type === 'CANVAS' ? n.name : page, n.type === 'CANVAS' || n.type === 'DOCUMENT' ? path : [...path, n.name]);
    };
    walk(res.document, '', []);
  }

  const pageInfo = pages.map((p) => {
    const setsOnPage = [...located.values()].filter((l) => l.page === p.name).length;
    const { kind, reason } = classifyPage(p, setsOnPage, overrides);
    const kids = p.children ?? [];
    return { name: p.name, kind, reason, sets: setsOnPage, frames: kids.filter((c) => c.type !== 'COMPONENT_SET' && c.type !== 'COMPONENT').length, standaloneComponents: kids.filter((c) => c.type === 'COMPONENT').length };
  });
  const activePages = new Set(pageInfo.filter((p) => p.kind === 'components').map((p) => p.name));

  const sets: DiscoveredSet[] = Object.entries(allSets)
    .map(([id, s]) => ({ id, name: s.name, ...(s.key ? { key: s.key } : {}), page: located.get(id)?.page ?? '', path: located.get(id)?.path ?? [] }))
    .filter((s) => activePages.has(s.page));

  // Frame candidates on component pages, read two levels deep for a content profile.
  const candidates = pages
    .filter((p) => activePages.has(p.name))
    .flatMap((p) => (p.children ?? []).filter((c) => c.type !== 'COMPONENT_SET' && c.type !== 'COMPONENT').map((c) => ({ page: p.name, node: c })));
  const unclear = candidates.filter((c) => c.node.type === 'FRAME' || c.node.type === 'SECTION').filter((c) => !DOC_NAME.test(c.node.name) && !EXAMPLE_NAME.test(c.node.name));
  const details = new Map<string, FigmaNode>();
  for (let i = 0; i < unclear.length; i += 25) {
    const res = await client.nodes(fileKey, unclear.slice(i, i + 25).map((c) => c.node.id), file.version, 3);
    for (const [id, e] of Object.entries(res.nodes)) if (e) details.set(id, e.document);
  }
  const frames: DiscoveredFrame[] = candidates.map(({ page, node }) => {
    const forced = overrides.frames?.[node.id];
    const c = forced ? { kind: forced, confidence: 1, reason: 'Set by overrides.' } : classifyFrame(node, details.get(node.id));
    return { id: node.id, name: node.name, page, ...c };
  });

  // Set content (for template matching): top-level sets via the nodes endpoint.
  const topIds = sets.map((s) => s.id).filter((id) => !fullNodes.has(id));
  for (let i = 0; i < topIds.length; i += 25) {
    const res = await client.nodes(fileKey, topIds.slice(i, i + 25), file.version);
    for (const [id, e] of Object.entries(res.nodes)) if (e) fullNodes.set(id, e.document);
  }

  const proposals = propose(sets, fullNodes, overrides).map((p) => ({
    ...p,
    docFrames: frames.filter((f) => f.page === p.page && f.kind === 'documentation').map((f) => f.id),
  }));

  const review: Discovery['review'] = [
    ...frames.filter((f) => f.confidence < REVIEW_THRESHOLD).map((f) => ({ item: `Frame "${f.name}" (${f.id}) on ${f.page}`, question: 'Is this documentation, an example, or something else?', current: `${f.kind} (${f.reason})` })),
    ...proposals.filter((p) => p.confidence < REVIEW_THRESHOLD).map((p) => ({ item: `Component ${p.name} (${p.page})`, question: 'Which archetype is this, and what should it do (keyboard, focus, ARIA)?', current: `${p.template}: ${p.reason}` })),
  ];
  log(`Discovery: ${sets.length} component sets on ${activePages.size} pages, ${frames.length} frames, ${review.length} item(s) to review`);
  return { fileKey, fileName: file.name, version: file.version, pages: pageInfo, sets, frames, proposals, review };
}

/** Engine targets for the IR, built from discovery instead of hand-written config. */
export function targetsFromDiscovery(d: Discovery): ComponentTarget[] {
  return d.sets.map((s) => {
    const p = d.proposals.find((x) => Object.values(x.sets).includes(s.id));
    return {
      id: `auto.${s.id}`,
      archetype: p?.template === 'action' ? 'action' : p?.template === 'checkbox' ? 'selection.binary' : p?.template === 'accordion' ? 'disclosure' : p?.template === 'switch' ? 'switch' : p?.template?.startsWith('radio') ? 'radio' : p?.template === 'input' ? 'input' : p?.template === 'dialog' ? 'dialog' : 'generic',
      figma: { page: s.page, componentSet: { id: s.id, name: s.name }, docFrames: p?.docFrames ?? [] },
    };
  });
}

export function discoveryMarkdown(d: Discovery): string {
  const lines = [
    `# Discovery: ${d.fileName}`,
    '',
    `File \`${d.fileKey}\`, version ${d.version}. ${d.sets.length} component sets, ${d.proposals.length} components proposed, ${d.review.length} item(s) to review.`,
    '',
    '## Pages',
    '',
    '| Page | Kind | Sets | Why |',
    '| --- | --- | --- | --- |',
    ...d.pages.map((p) => `| ${p.name} | ${p.kind} | ${p.sets} | ${p.reason} |`),
    '',
    '## Proposed components',
    '',
    '| Component | Template | Figma sets | Confidence | Why |',
    '| --- | --- | --- | --- | --- |',
    ...d.proposals.map((p) => `| ${p.name} | ${p.template} | ${Object.entries(p.sets).map(([r, id]) => `${d.sets.find((s) => s.id === id)?.name} (${r})`).join(', ')} | ${p.confidence} | ${p.reason} |`),
    '',
    '## Frames',
    '',
    '| Page | Frame | Kind | Confidence | Why |',
    '| --- | --- | --- | --- | --- |',
    ...d.frames.map((f) => `| ${f.page} | ${f.name} | ${f.kind} | ${f.confidence} | ${f.reason} |`),
    '',
    '## Needs a person',
    '',
    ...(d.review.length ? d.review.map((r) => `- **${r.item}**: ${r.question} Currently: ${r.current}`) : ['Nothing.']),
    '',
    'Answer by adding `overrides` to the `generate` section of `ds-sync.config.json`.',
    '',
  ];
  return lines.join('\n');
}
