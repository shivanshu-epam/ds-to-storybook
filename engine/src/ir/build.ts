import type { ComponentTarget } from '../config.ts';
import type { FigmaColor, FigmaNode, FigmaPaint, VariableAlias } from '../figma/types.ts';
import { sha256, stripPropertyId } from '../util/core.ts';
import type { FigmaIR, IRComponentSet, IRDocBlock, IRDocFrame, IRExposedInstance, IRPart, IRProperty, IRStyle, IRValue, IRVariable, IRVariant } from './types.ts';

export function toHex(c: FigmaColor, opacity = 1): string {
  const ch = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  const a = c.a * opacity;
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}${a < 1 ? ch(a) : ''}`;
}

/** Parses "Variant=Primary, Size=Sm" into {Variant: "Primary", Size: "Sm"}. */
export function parseVariantName(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of name.split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

type Resolver = (id: string | null) => string | undefined;

function aliasId(binding: unknown): string | null {
  if (binding && typeof binding === 'object' && (binding as VariableAlias).type === 'VARIABLE_ALIAS') return (binding as VariableAlias).id;
  return null;
}

function numberValue(node: FigmaNode, key: keyof FigmaNode, resolve: Resolver): IRValue<number> | undefined {
  const value = node[key];
  if (typeof value !== 'number') return undefined;
  const variableId = aliasId(node.boundVariables?.[key as string]);
  const variableName = resolve(variableId);
  return variableName ? { value, variableId, variableName } : { value, variableId };
}

/**
 * Figma linear gradient -> CSS linear-gradient. Figma places stops along the handle from p0 to p1
 * (node space); CSS places them along a line through the centre that spans the box at that angle.
 */
export function linearGradient(p: FigmaPaint, w: number, h: number): string | undefined {
  const [p0, p1] = p.gradientHandlePositions ?? [];
  if (!p0 || !p1 || !p.gradientStops?.length || !w || !h) return undefined;
  const dx = (p1.x - p0.x) * w;
  const dy = (p1.y - p0.y) * h;
  const len = Math.hypot(dx, dy);
  if (!len) return undefined;
  const ux = dx / len;
  const uy = dy / len;
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const cssLen = Math.abs(w * ux) + Math.abs(h * uy);
  const at = (t: number) => {
    const x = (p0.x + t * (p1.x - p0.x)) * w - w / 2;
    const y = (p0.y + t * (p1.y - p0.y)) * h - h / 2;
    return ((x * ux + y * uy + cssLen / 2) / cssLen) * 100;
  };
  const stops = p.gradientStops.map((st) => `${toHex(st.color, p.opacity ?? 1)} ${round(at(st.position))}%`);
  return `linear-gradient(${round((angle + 360) % 360)}deg, ${stops.join(', ')})`;
}

function paints(list: FigmaPaint[] | undefined, resolve: Resolver, node?: FigmaNode): IRValue<string>[] {
  return (list ?? [])
    .filter((p) => p.visible !== false)
    .map((p) => {
      const box = node?.absoluteBoundingBox;
      const value = p.type === 'SOLID' && p.color ? toHex(p.color, p.opacity ?? 1)
        : p.type === 'GRADIENT_LINEAR' && box ? linearGradient(p, box.width, box.height) ?? p.type
        : p.type;
      const variableId = p.boundVariables?.color?.id ?? null;
      const variableName = resolve(variableId);
      return variableName ? { value, variableId, variableName } : { value, variableId };
    });
}

export function styleOf(node: FigmaNode, resolve: Resolver, parent?: FigmaNode): IRStyle {
  const style: IRStyle = { fills: paints(node.fills, resolve, node), strokes: paints(node.strokes, resolve) };
  if (node.strokeDashes?.length && style.strokes.length) style.dashes = node.strokeDashes.map(round);
  const rb = node.absoluteRenderBounds;
  const bb = node.absoluteBoundingBox;
  if (rb && bb && (rb.x < bb.x || rb.y < bb.y || rb.x + rb.width > bb.x + bb.width || rb.y + rb.height > bb.y + bb.height)) {
    style.paintBox = [round(bb.x - rb.x), round(bb.y - rb.y), round(rb.width), round(rb.height)];
  }
  if (node.layoutSizingHorizontal) style.sizingH = node.layoutSizingHorizontal;
  if (node.layoutSizingVertical) style.sizingV = node.layoutSizingVertical;
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    if (node.primaryAxisAlignItems) style.primaryAlign = node.primaryAxisAlignItems;
    if (node.counterAxisAlignItems) style.counterAlign = node.counterAxisAlignItems;
    if (node.layoutWrap === 'WRAP') style.wrap = true;
  }
  if (node.clipsContent) style.clips = true;
  if (node.layoutPositioning === 'ABSOLUTE') style.absolute = true;
  if (parent?.absoluteBoundingBox && node.absoluteBoundingBox) {
    style.x = round(node.absoluteBoundingBox.x - parent.absoluteBoundingBox.x);
    style.y = round(node.absoluteBoundingBox.y - parent.absoluteBoundingBox.y);
  }
  if (node.type === 'TEXT' && node.style?.textAlignHorizontal && node.style.textAlignHorizontal !== 'LEFT') style.textAlign = node.style.textAlignHorizontal;
  if (node.layoutMode && node.layoutMode !== 'NONE') style.layoutMode = node.layoutMode;
  if (node.absoluteBoundingBox) {
    style.width = round(node.absoluteBoundingBox.width);
    style.height = round(node.absoluteBoundingBox.height);
  }
  for (const key of ['strokeWeight', 'cornerRadius', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing'] as const) {
    const v = numberValue(node, key, resolve);
    if (v) style[key] = v;
  }
  if (node.strokeAlign && style.strokes.length) style.strokeAlign = node.strokeAlign;
  if (node.individualStrokeWeights && style.strokes.length) style.strokeSides = { ...node.individualStrokeWeights };
  if (node.rotation) style.rotation = round((-node.rotation * 180) / Math.PI);
  if (node.opacity !== undefined && node.opacity < 1) style.opacity = round(node.opacity);
  const shadows = (node.effects ?? [])
    .filter((e) => e.visible !== false && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.color)
    .map((e) => `${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${e.offset?.x ?? 0}px ${e.offset?.y ?? 0}px ${e.radius ?? 0}px ${e.spread ?? 0}px ${toHex(e.color!)}`);
  if (shadows.length) style.shadows = shadows;
  if (node.type === 'TEXT' && node.style) {
    const t = node.style;
    style.text = {
      ...(t.fontFamily ? { fontFamily: t.fontFamily } : {}),
      ...(t.fontSize ? { fontSize: t.fontSize } : {}),
      ...(t.fontWeight ? { fontWeight: t.fontWeight } : {}),
      ...(t.lineHeightPx ? { lineHeightPx: round(t.lineHeightPx) } : {}),
      ...(t.letterSpacing ? { letterSpacing: round(t.letterSpacing) } : {}),
    };
  }
  return style;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Is this instance an icon? Named "Icon/…", or (design systems that name icons "search", "arrow-right") a standalone
 * component (not a variant: no "=" in its name) that is square, at most 48px, and made only of shapes.
 */
export function isIconNode(node: FigmaNode, componentNames: Record<string, string>): boolean {
  if (node.type !== 'INSTANCE' || !node.componentId) return false;
  const name = componentNames[node.componentId] ?? '';
  if (/^icons?\//i.test(name)) return true;
  if (!name || name.includes('=')) return false;
  const box = node.absoluteBoundingBox;
  if (!box || box.width > 48 || box.height > 48 || Math.abs(box.width - box.height) > 1) return false;
  const shapesOnly = (n: FigmaNode): boolean => (n.children ?? []).every((c) => c.type !== 'TEXT' && c.type !== 'INSTANCE' ? shapesOnly(c) : c.type === 'INSTANCE' ? isIconNode(c, componentNames) || shapesOnly(c) : false);
  return shapesOnly(node);
}

/** Shapes CSS cannot draw: their outline is exported from Figma as SVG. */
const OUTLINED = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'REGULAR_POLYGON']);

function collectParts(node: FigmaNode, resolve: Resolver, prefix: string, out: IRPart[], componentNames: Record<string, string>, hiddenAncestor = false): void {
  const seen = new Map<string, number>();
  for (const child of node.children ?? []) {
    // Repeated siblings with one name (two form fields, seven day cells) each get a path of their own ("name#2").
    // Repeated instances keep one path: the generator renders them as copies of one layer.
    const n = (seen.get(child.name) ?? 0) + 1;
    seen.set(child.name, n);
    const name = n > 1 && child.type !== 'INSTANCE' ? `${child.name}#${n}` : child.name;
    const path = prefix ? `${prefix}/${name}` : name;
    const part: IRPart = { path, parent: prefix, name: child.name, type: child.type, style: styleOf(child, resolve, node) };
    const refs = child.componentPropertyReferences;
    if (refs && (refs.visible || refs.characters || refs.mainComponent)) {
      part.refs = Object.fromEntries(Object.entries(refs).filter(([, v]) => v).map(([k, v]) => [k, stripPropertyId(v!)]));
    }
    // Hidden layers are kept: they are usually optional parts toggled by a boolean property.
    if (child.visible === false || hiddenAncestor) part.hidden = true;
    if (child.type === 'TEXT' && child.characters !== undefined) part.text = child.characters;
    if (OUTLINED.has(child.type)) part.nodeId = child.id;
    if (child.type === 'INSTANCE' && child.componentId) {
      const instanceOf = componentNames[child.componentId];
      if (instanceOf) part.instanceOf = instanceOf;
      if (isIconNode(child, componentNames)) part.icon = true;
      part.instanceComponentId = child.componentId;
      const inner = firstSolidFill(child, resolve);
      if (inner) part.innerColor = inner;
      const innerText = firstText(child);
      if (innerText) part.innerText = innerText;
      const props = Object.entries(child.componentProperties ?? {}).filter(([, v]) => v.type === 'BOOLEAN' || v.type === 'TEXT');
      if (props.length) part.instanceProps = Object.fromEntries(props.map(([k, v]) => [stripPropertyId(k), v.value]));
      const icons = (child.children ?? [])
        .filter((c) => c.type === 'INSTANCE' && c.visible !== false && c.componentId && isIconNode(c, componentNames))
        .map((c) => ({ layer: c.name, name: componentNames[c.componentId!]!, componentId: c.componentId! }));
      if (icons.length) part.innerIcons = icons;
      const swaps = swapValues(child, componentNames);
      if (swaps) part.instanceSwaps = swaps;
      if (child.isExposedInstance) part.exposed = true;
      const exposed = exposedInside(child, '', componentNames, Boolean(part.hidden));
      if (exposed.length) part.exposedInstances = exposed;
    }
    out.push(part);
    // Instances are leaves: their internals belong to the referenced component.
    if (child.type !== 'INSTANCE') collectParts(child, resolve, path, out, componentNames, Boolean(part.hidden));
  }
}

function simpleProps(node: FigmaNode): Record<string, string | boolean> | undefined {
  const props = Object.entries(node.componentProperties ?? {}).filter(([, v]) => v.type === 'BOOLEAN' || v.type === 'TEXT');
  return props.length ? Object.fromEntries(props.map(([k, v]) => [stripPropertyId(k), v.value])) : undefined;
}

function swapValues(node: FigmaNode, componentNames: Record<string, string>): Record<string, string> | undefined {
  const swaps = Object.entries(node.componentProperties ?? {}).filter(([, v]) => v.type === 'INSTANCE_SWAP' && typeof v.value === 'string');
  return swaps.length ? Object.fromEntries(swaps.map(([k, v]) => [stripPropertyId(k), componentNames[String(v.value)] ?? String(v.value)])) : undefined;
}

/** Exposed nested instances inside an instance (paths built like collectParts), not descending past one. */
function exposedInside(node: FigmaNode, prefix: string, componentNames: Record<string, string>, hiddenAncestor: boolean): IRExposedInstance[] {
  const out: IRExposedInstance[] = [];
  const seen = new Map<string, number>();
  for (const child of node.children ?? []) {
    const n = (seen.get(child.name) ?? 0) + 1;
    seen.set(child.name, n);
    const name = n > 1 && child.type !== 'INSTANCE' ? `${child.name}#${n}` : child.name;
    const path = prefix ? `${prefix}/${name}` : name;
    const hidden = hiddenAncestor || child.visible === false;
    if (child.type === 'INSTANCE' && child.isExposedInstance && child.componentId) {
      const props = simpleProps(child);
      const swaps = swapValues(child, componentNames);
      const instanceOf = componentNames[child.componentId];
      out.push({ path, name: child.name, componentId: child.componentId, ...(instanceOf ? { instanceOf } : {}), ...(hidden ? { hidden } : {}), ...(props ? { props } : {}), ...(swaps ? { swaps } : {}) });
      continue;
    }
    out.push(...exposedInside(child, path, componentNames, hidden));
  }
  return out;
}

function firstText(node: FigmaNode): string | undefined {
  for (const c of node.children ?? []) {
    if (c.visible === false) continue;
    if (c.type === 'TEXT' && c.characters?.trim()) return c.characters;
    const deeper = firstText(c);
    if (deeper) return deeper;
  }
  return undefined;
}

function firstSolidFill(node: FigmaNode, resolve: Resolver): IRValue<string> | undefined {
  for (const c of node.children ?? []) {
    if (c.visible === false) continue;
    const fill = [...paints(c.fills, resolve), ...paints(c.strokes, resolve)].find((p) => p.value.startsWith('#'));
    if (fill) return fill;
    const deeper = firstSolidFill(c, resolve);
    if (deeper) return deeper;
  }
  return undefined;
}

/** All visible text in reading order (top-to-bottom, then left-to-right). */
export function docBlocks(frame: FigmaNode): IRDocBlock[] {
  const found: { node: FigmaNode; y: number; x: number }[] = [];
  const walk = (n: FigmaNode) => {
    if (n.visible === false) return;
    if (n.type === 'TEXT' && n.characters?.trim()) {
      found.push({ node: n, y: n.absoluteBoundingBox?.y ?? 0, x: n.absoluteBoundingBox?.x ?? 0 });
    }
    // Instances inside doc frames are usually live examples, not prose.
    if (n.type !== 'INSTANCE') for (const c of n.children ?? []) walk(c);
  };
  walk(frame);
  found.sort((a, b) => a.y - b.y || a.x - b.x);
  return found.map(({ node }) => {
    const block: IRDocBlock = { nodeId: node.id, text: node.characters!.trim() };
    if (node.style?.fontSize) block.fontSize = node.style.fontSize;
    return block;
  });
}

export function buildProperties(set: FigmaNode): IRProperty[] {
  return Object.entries(set.componentPropertyDefinitions ?? {}).map(([rawName, def]) => {
    const prop: IRProperty = { name: stripPropertyId(rawName), rawName, type: def.type, default: def.defaultValue };
    if (def.variantOptions) prop.options = [...def.variantOptions];
    return prop;
  });
}

export interface BuildSetInput {
  target: ComponentTarget;
  set: FigmaNode;
  key?: string;
  docFrames: FigmaNode[];
  componentNames: Record<string, string>;
  resolve: Resolver;
  notes?: string[];
}

export function buildComponentSet(input: BuildSetInput): IRComponentSet {
  const { target, set, resolve } = input;
  const variants: IRVariant[] = (set.children ?? [])
    .filter((c) => c.type === 'COMPONENT')
    .map((c) => {
      const parts: IRPart[] = [];
      collectParts(c, resolve, '', parts, input.componentNames);
      return { nodeId: c.id, name: c.name, values: parseVariantName(c.name), style: styleOf(c, resolve), parts };
    });
  const docFrames: IRDocFrame[] = input.docFrames.map((f) => ({ nodeId: f.id, name: f.name, blocks: docBlocks(f) }));
  const body = {
    targetId: target.id,
    nodeId: set.id,
    name: set.name,
    ...(input.key ? { key: input.key } : {}),
    description: set.description ?? '',
    page: target.figma.page,
    properties: buildProperties(set),
    variants,
    docFrames,
    notes: input.notes ?? [],
  };
  return { ...body, hash: sha256(body) };
}

export function emptyVariables(): FigmaIR['variables'] {
  return { source: 'none', byId: {}, byName: {} };
}

/** Index of the repo's exported variables (tokens/figma-variables.json format). */
export function variablesFromExport(json: { variables?: Record<string, unknown[]> }): Record<string, IRVariable> {
  const byName: Record<string, IRVariable> = {};
  for (const [collection, rows] of Object.entries(json.variables ?? {})) {
    for (const row of rows) {
      if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
      const syntax = typeof row[3] === 'string' ? row[3] : '';
      const css = /var\((--[\w-]+)\)/.exec(syntax)?.[1];
      byName[row[0]] = css ? { name: row[0], collection, cssVar: css } : { name: row[0], collection };
    }
  }
  return byName;
}
