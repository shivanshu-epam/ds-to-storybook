/**
 * Figma IR: a lossless-enough, normalized snapshot of what the engine needs from Figma.
 * Deterministic for a given Figma version: no timestamps inside hashed parts.
 */

export interface IRValue<T> {
  value: T;
  /** Variable id the property is bound to, or null when the value is raw. */
  variableId: string | null;
  /** Resolved variable name when the Variables API (or a matching export) is available. */
  variableName?: string;
}

export interface IRStyle {
  layoutMode?: string;
  width?: number;
  height?: number;
  fills: IRValue<string>[];
  strokes: IRValue<string>[];
  strokeWeight?: IRValue<number>;
  /** Painted area relative to the frame (left, top, width, height), from Figma absoluteRenderBounds. */
  paintBox?: [number, number, number, number];
  /** Dash pattern of the stroke (dash, gap, ...), from Figma strokeDashes. */
  dashes?: number[];
  cornerRadius?: IRValue<number>;
  paddingLeft?: IRValue<number>;
  paddingRight?: IRValue<number>;
  paddingTop?: IRValue<number>;
  paddingBottom?: IRValue<number>;
  itemSpacing?: IRValue<number>;
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  /** Per-side stroke weights when they differ (e.g. a bottom border only). */
  strokeSides?: { top: number; right: number; bottom: number; left: number };
  /** Degrees, clockwise as in CSS. */
  rotation?: number;
  /** Auto-layout sizing of this node inside its parent. */
  sizingH?: 'FIXED' | 'HUG' | 'FILL';
  sizingV?: 'FIXED' | 'HUG' | 'FILL';
  /** Auto-layout alignment of this node's children. */
  primaryAlign?: string;
  counterAlign?: string;
  wrap?: boolean;
  clips?: boolean;
  /** Absolutely positioned inside an auto-layout parent. */
  absolute?: boolean;
  /** Position relative to the parent node (px). */
  x?: number;
  y?: number;
  textAlign?: string;
  opacity?: number;
  /** Drop and inner shadows as CSS box-shadow fragments. */
  shadows?: string[];
  /** TEXT nodes only. */
  text?: { fontFamily?: string; fontSize?: number; fontWeight?: number; lineHeightPx?: number; letterSpacing?: number };
}

export interface IRPart {
  /** Layer path from the variant root, e.g. "Container/Label". Layer names may contain "/", so use parent for structure. */
  path: string;
  /** Path of the parent layer ("" for direct children of the variant root). */
  parent: string;
  /** Layer name. */
  name: string;
  type: string;
  style: IRStyle;
  text?: string;
  /** Main component name for instances (e.g. an icon). */
  instanceOf?: string;
  /** An icon: an "Icon/…" component, or a small square standalone component made only of shapes. */
  icon?: boolean;
  /** Main component node id for instances. */
  instanceComponentId?: string;
  /** Component properties bound to this layer (names without the #id suffix). */
  refs?: { visible?: string; characters?: string; mainComponent?: string };
  /** Hidden in this variant (an optional part, usually toggled by a boolean property). */
  hidden?: boolean;
  /** First solid fill found inside an instance (e.g. an icon's vector colour). */
  innerColor?: IRValue<string>;
  /** First text inside an instance (e.g. a nested button's label override). */
  innerText?: string;
  /** Boolean and text property values set on this instance (overrides of the main component's defaults). */
  instanceProps?: Record<string, string | boolean>;
  /** Visible icon instances directly inside this instance (e.g. a nested button's leading icon). */
  innerIcons?: { layer: string; name: string; componentId: string }[];
}

export interface IRVariant {
  nodeId: string;
  name: string;
  values: Record<string, string>;
  style: IRStyle;
  parts: IRPart[];
}

export interface IRProperty {
  /** Name without Figma's #id suffix. */
  name: string;
  rawName: string;
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  default: string | boolean;
  options?: string[];
}

export interface IRDocBlock {
  nodeId: string;
  text: string;
  fontSize?: number;
}

export interface IRDocFrame {
  nodeId: string;
  name: string;
  blocks: IRDocBlock[];
}

export interface IRComponentSet {
  targetId: string;
  nodeId: string;
  name: string;
  key?: string;
  description: string;
  page: string;
  properties: IRProperty[];
  variants: IRVariant[];
  docFrames: IRDocFrame[];
  /** Notes about how the set was found (e.g. matched by name because the pinned id moved). */
  notes: string[];
  /** sha256 of this set's normalized content. */
  hash: string;
}

export interface IRVariable {
  name: string;
  collection: string;
  cssVar?: string;
}

export interface FigmaIR {
  irVersion: 1;
  fileKey: string;
  fileName: string;
  version: string;
  lastModified: string;
  variables: {
    /** rest = Variables REST API; export = repo's exported JSON (names only, ids unresolved); none. */
    source: 'rest' | 'export' | 'none';
    note?: string;
    byId: Record<string, IRVariable>;
    byName: Record<string, IRVariable>;
  };
  components: IRComponentSet[];
  /** Targets that could not be found in Figma. */
  missing: { targetId: string; reason: string }[];
}
