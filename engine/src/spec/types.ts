/** Component Spec v0.1: the framework-neutral meaning layer built from the Figma IR. */

export type SpecSource = 'figma' | 'figma-doc' | 'archetype' | 'config';

export type SpecType =
  | { kind: 'enum'; options: string[] }
  | { kind: 'boolean' }
  | { kind: 'string' }
  | { kind: 'instance' };

export interface SpecProp {
  /** Code prop it maps to; null = intentionally none; false = confirmed code gap; undefined = not yet mapped. */
  codeProp: string | null | false | undefined;
  /** How codeProp was decided. */
  mappedBy: 'config' | 'name-match' | 'unmapped';
  figmaProperty: string;
  figmaType: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  type: SpecType;
  default: string | boolean;
  source: SpecSource;
  confidence: number;
}

export type StateKind = 'base' | 'pseudo' | 'prop' | 'behavioural' | 'data' | 'unknown';

export interface SpecState {
  figmaAxis: string;
  figmaValue: string;
  /** Canonical names, e.g. "Error-Selected" -> ["error", "checked"]. */
  canonical: string[];
  kind: StateKind;
  /** Code expression from config.stateMap, when given. */
  codeExpression?: string | null;
}

export interface SpecGap {
  field: string;
  message: string;
  source: SpecSource;
}

export interface ComponentSpec {
  specVersion: '0.1';
  id: string;
  name: string;
  archetype: string;
  figma: { fileKey: string; nodeId: string; key?: string; version: string; page: string; irHash: string };
  code: { file: string; export: string };
  props: SpecProp[];
  states: SpecState[];
  variantMatrix: {
    axes: string[];
    stateAxes: string[];
    count: number;
    /** Product of all axis option counts; larger than count when the set is sparse. */
    fullCount: number;
    default: Record<string, string>;
  };
  anatomy: string[];
  tokens: {
    boundCount: number;
    rawCount: number;
    rawExamples: { variant: string; path: string; property: string; value: string | number }[];
    variableNames: string[];
  };
  docs: { frames: { nodeId: string; name: string; blocks: number }[]; text: string };
  behaviour: {
    pattern: string;
    keyboard: { key: string; action: string; documentedInFigma: boolean }[];
  };
  gaps: SpecGap[];
  notes: string[];
}

export interface Archetype {
  id: string;
  pattern: string;
  role: string;
  requiredStates: string[];
  keyboard: { key: string; action: string }[];
  requiredBehaviour?: { field: string; question: string }[];
  requiredDocs?: string[];
}
