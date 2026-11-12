import type { ComponentTarget } from '../config.ts';
import type { FigmaColor, FigmaNode, FigmaPaint, VariableAlias } from '../figma/types.ts';
import { sha256, stripPropertyId } from '../util/core.ts';
import type { FigmaIR, IRComponentSet, IRDocBlock, IRDocFrame, IRPart, IRProperty, IRStyle, IRValue, IRVariable, IRVariant } from './types.ts';

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

function paints(list: FigmaPaint[] | undefined, resolve: Resolver): IRValue<string>[] {
  return (list ?? [])
    .filter((p) => p.visible !== false)
    .map((p) => {
      const value = p.type === 'SOLID' && p.color ? toHex(p.color, p.opacity ?? 1) : p.type;
      const variableId = p.boundVariables?.color?.id ?? null;
      const variableName = resolve(variableId);
      return variableName ? { value, variableId, variableName } : { value, variableId };
    });
}

export function styleOf(node: FigmaNode, resolve: Resolver, parent?: FigmaNode): IRStyle {
  const style: IRStyle = { fills: paints(node.fills, resolve), strokes: paints(node.strokes, resolve) };
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

function collectParts(node: FigmaNode, resolve: Resolver, prefix: string, out: IRPart[], componentNames: Record<string, string>, hiddenAncestor = false): void {
  for (const child of node.children ?? []) {
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    const part: IRPart = { path, parent: prefix, name: child.name, type: child.type, style: styleOf(child, resolve, node) };
    const refs = child.componentPropertyReferences;
    if (refs && (refs.visible || refs.characters || refs.mainComponent)) {
      part.refs = Object.fromEntries(Object.entries(refs).filter(([, v]) => v).map(([k, v]) => [k, stripPropertyId(v!)]));
    }
    // Hidden layers are kept: they are usually optional parts toggled by a boolean property.
    if (child.visible === false || hiddenAncestor) part.hidden = true;
    if (child.type === 'TEXT' && child.characters !== undefined) part.text = child.characters;
    if (child.type === 'INSTANCE' && child.componentId) {
      const instanceOf = componentNames[child.componentId];
      if (instanceOf) part.instanceOf = instanceOf;
      part.instanceComponentId = child.componentId;
      const inner = firstSolidFill(child, resolve);
      if (inner) part.innerColor = inner;
      const innerText = firstText(child);
      if (innerText) part.innerText = innerText;
      const props = Object.entries(child.componentProperties ?? {}).filter(([, v]) => v.type === 'BOOLEAN' || v.type === 'TEXT');
      if (props.length) part.instanceProps = Object.fromEntries(props.map(([k, v]) => [stripPropertyId(k), v.value]));
      const icons = (child.children ?? [])
        .filter((c) => c.type === 'INSTANCE' && c.visible !== false && c.componentId && /^icons?\//i.test(componentNames[c.componentId] ?? ''))
        .map((c) => ({ layer: c.name, name: componentNames[c.componentId!]!, componentId: c.componentId! }));
      if (icons.length) part.innerIcons = icons;
    }
    out.push(part);
    // Instances are leaves: their internals belong to the referenced component.
    if (child.type !== 'INSTANCE') collectParts(child, resolve, path, out, componentNames, Boolean(part.hidden));
  }
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
