/** Component Doc Spec v1 (docs/DOCS-ENGINE.md section 6): what a component's Storybook documentation must contain,
 * built for every component the Figma file defines, and checked against the stories and docs page that were generated. */

export interface Reference {
  id: string;
  title: string;
  matches: { behaviours: string[]; names: string[] };
  primaryAxis: string[];
  sections: { id: string; required: boolean }[];
  stories: Record<string, boolean | string>;
  accessibility: { pattern: string; role: string; name: string; keyboard?: { key: string; action: string }[] };
  related?: string[];
  /** General guidance for this kind (ds-sync standard), citable by usage drafts. */
  guidance?: { whenToUse: string[]; whenNotToUse: string[] };
}

/** Where something in the spec came from. */
export type Source = 'figma' | 'figma-doc' | 'decision' | 'reference' | 'generator';

/** Shown: visible in a story. control: only reachable through a Storybook control. test: only in the test-only variants
 * story. interactive: a state the real component shows when you hover, focus or press it (code mode). missing: not in
 * Storybook at all. n/a: does not apply. */
export type Coverage = 'shown' | 'control' | 'test' | 'interactive' | 'missing' | 'n/a';

export interface DocSpecProperty {
  figma: string;
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  /** Code prop(s) it became; empty when it has none. */
  props: string[];
  role: 'appearance' | 'state' | 'content' | 'option' | 'slot';
  default: string | boolean;
  control: string;
  coverage: Coverage;
  values?: { figma: string; coverage: Coverage }[];
  description?: { text: string; source: Source };
}

export interface DocSpecSection {
  id: string;
  required: boolean;
  status: 'present' | 'missing';
  /** Heading it was found under in the docs page. */
  heading?: string;
}

export interface DocSpecStory {
  export: string;
  name: string;
  /** dev = in the sidebar; docs = docs page only; test = test-only. */
  visibility: 'dev' | 'docs' | 'test';
  /** Figma properties it shows. */
  shows: string[];
}

export interface DocSpec {
  specVersion: '1.0';
  component: string;
  title: string;
  kind: { id: string; title: string; from: 'behaviour' | 'name' | 'fallback' };
  /** Behaviour the generator recognised from structure (a template or a collection), if any. */
  behaviour?: string;
  buildingBlock: boolean;
  figma: {
    fileKey: string;
    version: string;
    sets: { id: string; name: string; page: string; variants: number }[];
    docFrames: { id: string; name: string }[];
  };
  description?: { text: string; source: Source };
  properties: DocSpecProperty[];
  stories: DocSpecStory[];
  sections: DocSpecSection[];
  accessibility: Reference['accessibility'] & { source: 'reference' };
  related: string[];
  coverage: {
    properties: { total: number; covered: number };
    values: { total: number; shown: number; control: number; missing: number };
    /** interactive: variants in a hover, focus or pressed state, shown by interacting with the real component. */
    variants: { total: number; rendered: number; interactive?: number };
    sections: { required: number; present: number };
    /** Every Figma item is in Storybook (shown, a control, or rendered in the variants story). */
    complete: boolean;
  };
  gaps: { item: string; message: string }[];
}
