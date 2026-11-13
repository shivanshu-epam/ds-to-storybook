// The subset of the Figma REST API shapes the engine reads.
// Reference: https://developers.figma.com/docs/rest-api/

export interface FigmaColor { r: number; g: number; b: number; a: number }

export interface VariableAlias { type: 'VARIABLE_ALIAS'; id: string }

export interface FigmaPaint {
  type: string; // SOLID | GRADIENT_* | IMAGE ...
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  boundVariables?: { color?: VariableAlias };
  /** Gradients: handle positions (0-1, node space) and colour stops. */
  gradientHandlePositions?: { x: number; y: number }[];
  gradientStops?: { position: number; color: FigmaColor }[];
}

export interface ComponentPropertyDefinition {
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  defaultValue: string | boolean;
  variantOptions?: string[];
  preferredValues?: { type: string; key: string }[];
}

export interface FigmaNode {
  /** Painted area including effects (shadows, outside strokes). */
  absoluteRenderBounds?: { x: number; y: number; width: number; height: number } | null;
  /** Dash and gap lengths of a dashed stroke. */
  strokeDashes?: number[];
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  description?: string;
  componentPropertyDefinitions?: Record<string, ComponentPropertyDefinition>;
  componentProperties?: Record<string, { type: string; value: string | boolean }>;
  componentId?: string;
  /** An instance inside a component whose properties Figma shows on the component's own panel ("expose nested instance"). */
  isExposedInstance?: boolean;
  characters?: string;
  style?: { fontFamily?: string; fontSize?: number; fontWeight?: number; lineHeightPx?: number; letterSpacing?: number; textCase?: string; textDecoration?: string; textAlignHorizontal?: string };
  opacity?: number;
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  individualStrokeWeights?: { top: number; right: number; bottom: number; left: number } | null;
  /** Radians. */
  rotation?: number;
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
  layoutWrap?: 'NO_WRAP' | 'WRAP';
  clipsContent?: boolean;
  componentPropertyReferences?: { visible?: string; characters?: string; mainComponent?: string };
  effects?: { type: string; visible?: boolean; color?: FigmaColor; offset?: { x: number; y: number }; radius?: number; spread?: number }[];
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  /** Node-level bindings: property name -> alias (or array of aliases for paints). */
  boundVariables?: Record<string, VariableAlias | VariableAlias[] | Record<string, VariableAlias>>;
}

export interface FileResponse {
  name: string;
  version: string;
  lastModified: string;
  document: FigmaNode;
  components?: Record<string, { key: string; name: string; componentSetId?: string }>;
  componentSets?: Record<string, { key: string; name: string; description?: string }>;
}

export interface NodesResponse {
  name: string;
  version: string;
  lastModified: string;
  nodes: Record<string, {
    document: FigmaNode;
    components?: Record<string, { key: string; name: string; componentSetId?: string }>;
    componentSets?: Record<string, { key: string; name: string; description?: string }>;
  } | null>;
}

export interface LocalVariablesResponse {
  meta: {
    variables: Record<string, {
      id: string;
      name: string;
      variableCollectionId: string;
      resolvedType: string;
      codeSyntax?: { WEB?: string };
      valuesByMode: Record<string, unknown>;
    }>;
    variableCollections: Record<string, { id: string; name: string; modes: { modeId: string; name: string }[] }>;
  };
}
