import type { CodeComponent, CodeIR, CodeProp } from '../code/analyze.ts';
import type { ComponentSpec, SpecProp } from '../spec/types.ts';
import { camelCase, looseKey } from '../util/core.ts';

export type Category = 'api' | 'states' | 'tokens' | 'stories' | 'docs' | 'design-gap' | 'extraction';
export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  componentId: string;
  category: Category;
  severity: Severity;
  title: string;
  detail?: string;
}

export interface PropMapping {
  figmaProperty: string;
  codeProp: string | null;
  mappedBy: SpecProp['mappedBy'];
}

export interface ComponentDrift {
  componentId: string;
  name: string;
  codeExport: string;
  findings: Finding[];
  mappings: PropMapping[];
  metrics: {
    figmaProps: number;
    mappedProps: number;
    codeOnlyProps: string[];
    tokenBindingRate: number | null;
    codeRawValues: number;
    undefinedVars: number;
    axesWithStory: number;
    axesTotal: number;
  };
}

/** Props that are plumbing, not design API. */
const INFRA = new Set(['children', 'className', 'style', 'ref', 'id', 'key']);

/** Normalizes enum values for comparison: "Sm" -> "sm", "Error-Selected" -> "errorselected". */
const normValue = (v: string) => looseKey(v);

/** Name candidates a Figma property might use in code: "Has leading icon" -> leadingIcon, hasLeadingIcon. */
function candidates(figmaName: string): string[] {
  const stripped = figmaName.replace(/^(has|show|is|with)\s+/i, '');
  return [...new Set([camelCase(figmaName), camelCase(stripped)].map(looseKey))];
}

const STATE_PROP_GUESS: Record<string, string[]> = {
  disabled: ['disabled'],
  error: ['error', 'invalid', 'aria-invalid'],
  checked: ['checked', 'defaultChecked'],
  indeterminate: ['indeterminate'],
  readonly: ['readOnly'],
  loading: ['loading'],
  warning: ['warning'],
  expanded: ['value', 'defaultValue', 'open', 'expanded', 'defaultOpen'],
};

export function diffComponent(spec: ComponentSpec, code: CodeComponent, codeIR: CodeIR): ComponentDrift {
  const findings: Finding[] = [];
  const add = (category: Category, severity: Severity, title: string, detail?: string) =>
    findings.push(detail ? { componentId: spec.id, category, severity, title, detail } : { componentId: spec.id, category, severity, title });

  const own = new Map(code.props.map((p) => [looseKey(p.name), p]));
  const all = new Set([...code.props.map((p) => p.name), ...code.inheritedProps]);
  const allLoose = new Map([...all].map((n) => [looseKey(n), n]));
  const mappings: PropMapping[] = [];
  const usedCodeProps = new Set<string>();

  if (!code.found) add('api', 'error', `Code component ${code.export} not found in ${code.file}`, code.notes.join(' '));

  // 1. Props
  for (const sp of spec.props) {
    if (sp.codeProp === false) {
      mappings.push({ figmaProperty: sp.figmaProperty, codeProp: null, mappedBy: 'config' });
      add('api', 'warning', `Figma property "${sp.figmaProperty}" has no code prop (confirmed code gap)`, `Code gap recorded in config: ${code.export} cannot express this ${sp.figmaType.toLowerCase()} property.`);
      continue;
    }
    let codeName: string | null | undefined = sp.codeProp;
    let mappedBy: SpecProp['mappedBy'] = sp.mappedBy;
    if (codeName === undefined) {
      const hit = candidates(sp.figmaProperty).map((c) => allLoose.get(c)).find(Boolean);
      if (hit) {
        codeName = hit;
        mappedBy = 'name-match';
      }
    }
    mappings.push({ figmaProperty: sp.figmaProperty, codeProp: codeName ?? null, mappedBy });
    if (codeName === null) {
      add('api', 'info', `Figma property "${sp.figmaProperty}" has no code prop (by config)`, 'Recorded as an intentional mapping, e.g. handled by another component.');
      continue;
    }
    if (codeName === undefined) {
      add('api', 'warning', `Figma property "${sp.figmaProperty}" has no matching code prop`, `Code gap: ${code.export} cannot express this ${sp.figmaType.toLowerCase()} property.`);
      continue;
    }
    usedCodeProps.add(codeName);
    const cp = own.get(looseKey(codeName));
    if (!cp) {
      if (!all.has(codeName)) add('api', 'warning', `Mapped prop "${codeName}" does not exist on ${code.export}`, `Check propMap for "${sp.figmaProperty}".`);
      continue;
    }
    compareProp(sp, cp, add);
  }

  // 2. Code-only props
  const codeOnlyProps = code.props
    .map((p) => p.name)
    .filter((n) => !usedCodeProps.has(n) && !INFRA.has(n) && !stateProps(spec).has(n));
  for (const n of codeOnlyProps) {
    const cp = own.get(looseKey(n));
    add('api', 'info', `Code-only prop "${n}"`, `Not in Figma. Document it as code-only rather than hiding it.${cp?.description ? ` Code docs: ${cp.description}` : ''}`);
  }

  // 3. States
  for (const s of spec.states) {
    if (s.kind === 'pseudo' || s.kind === 'base') continue;
    if (s.codeExpression === null) continue;
    if (s.codeExpression) {
      const missing = s.codeExpression.split('+').map((x) => x.trim()).filter((x) => x && !all.has(x));
      if (missing.length) add('states', 'warning', `State "${s.figmaValue}" maps to missing prop(s): ${missing.join(', ')}`);
      continue;
    }
    const unsupported = s.canonical.filter((c) => {
      const guesses = STATE_PROP_GUESS[c];
      return guesses ? !guesses.some((g) => all.has(g)) : false;
    });
    if (unsupported.length) {
      add('states', 'warning', `Figma state "${s.figmaAxis}=${s.figmaValue}" has no code prop`, `Looked for: ${unsupported.flatMap((u) => STATE_PROP_GUESS[u] ?? []).join(', ')}.`);
    }
  }

  // 4. Tokens
  const { boundCount, rawCount, rawExamples } = spec.tokens;
  const total = boundCount + rawCount;
  const tokenBindingRate = total ? boundCount / total : null;
  if (rawCount > 0) {
    add('tokens', 'warning', `${rawCount} raw design value(s) in Figma not bound to variables`,
      rawExamples.slice(0, 5).map((e) => `${e.path} ${e.property} = ${e.value} (${e.variant})`).join('; '));
  }
  let undefinedVars = 0;
  if (code.css) {
    if (code.css.rawValues.length) {
      add('tokens', 'warning', `${code.css.rawValues.length} raw value(s) in ${code.css.file}`,
        code.css.rawValues.slice(0, 6).map((r) => `L${r.line}: ${r.declaration}`).join(' | '));
    }
    const known = new Set([...codeIR.tokenVars, ...code.css.localVars]);
    const missing = code.css.varRefs.filter((v) => !known.has(v));
    undefinedVars = missing.length;
    if (missing.length) add('tokens', 'error', `${missing.length} CSS variable(s) used but not defined by tokens`, missing.join(', '));
  } else {
    add('tokens', 'info', 'No stylesheet configured or found; token usage in code not checked');
  }

  // 5. Stories
  const storyNames = code.stories?.exports ?? [];
  const storyLoose = storyNames.map(looseKey);
  const axes = spec.props.filter((p) => p.type.kind === 'enum' && p.type.options.length > 1).map((p) => p.figmaProperty);
  const covered = axes.filter((a) => {
    const k = looseKey(a).replace(/s$/, '');
    return storyLoose.some((s) => s.includes(k));
  });
  if (!code.stories) {
    add('stories', 'warning', 'No stories file found');
  } else {
    for (const a of axes.filter((x) => !covered.includes(x))) add('stories', 'warning', `No story shows the "${a}" axis`, `Stories: ${storyNames.join(', ')}`);
    if (!storyLoose.includes('default') && !storyNames.length) add('stories', 'warning', 'No Default story');
    if (spec.behaviour.keyboard.length && !storyLoose.some((s) => s.includes('keyboard'))) {
      add('stories', 'warning', 'No keyboard story', `Archetype ${spec.archetype} expects: ${spec.behaviour.keyboard.map((k) => k.key).join(', ')}.`);
    }
  }

  // 6. Docs
  if (!code.mdx) add('docs', 'warning', 'No MDX docs page found');
  if (spec.docs.frames.length === 0) add('docs', 'warning', 'No Figma documentation frames');

  // 7. Design gaps from the spec (what Figma does not specify)
  for (const g of spec.gaps) add('design-gap', g.source === 'archetype' ? 'info' : 'warning', g.message, `Field: ${g.field}`);
  for (const n of spec.notes) add('extraction', 'info', n);

  return {
    componentId: spec.id,
    name: spec.name,
    codeExport: code.export,
    findings,
    mappings,
    metrics: {
      figmaProps: spec.props.length,
      mappedProps: mappings.filter((m) => m.codeProp).length,
      codeOnlyProps,
      tokenBindingRate,
      codeRawValues: code.css?.rawValues.length ?? 0,
      undefinedVars,
      axesWithStory: covered.length,
      axesTotal: axes.length,
    },
  };
}

function stateProps(spec: ComponentSpec): Set<string> {
  const out = new Set<string>();
  for (const s of spec.states) {
    if (s.codeExpression) s.codeExpression.split('+').forEach((x) => out.add(x.trim()));
    for (const c of s.canonical) for (const g of STATE_PROP_GUESS[c] ?? []) out.add(g);
  }
  return out;
}

function compareProp(sp: SpecProp, cp: CodeProp, add: (c: Category, s: Severity, t: string, d?: string) => void): void {
  if (sp.type.kind === 'enum') {
    if (cp.type.kind !== 'enum') {
      add('api', 'warning', `"${sp.figmaProperty}" is an enum in Figma but "${cp.name}" is ${cp.type.kind} in code`);
      return;
    }
    const figma = new Map(sp.type.options.map((o) => [normValue(o), o]));
    const code = new Map(cp.type.options.map((o) => [normValue(o), o]));
    const figmaOnly = [...figma.keys()].filter((k) => !code.has(k)).map((k) => figma.get(k)!);
    const codeOnly = [...code.keys()].filter((k) => !figma.has(k)).map((k) => code.get(k)!);
    if (figmaOnly.length) add('api', 'warning', `"${cp.name}" is missing Figma option(s): ${figmaOnly.join(', ')}`, 'Code gap.');
    if (codeOnly.length) add('api', 'info', `"${cp.name}" has code-only option(s): ${codeOnly.join(', ')}`, 'Not in Figma.');
    const fd = normValue(String(sp.default));
    if (cp.default !== undefined && normValue(cp.default) !== fd) {
      add('api', 'warning', `Default differs for "${cp.name}": Figma ${sp.default}, code ${cp.default}`, 'Stories should set the Figma default in args, or the code default should change.');
    }
  }
  if (sp.type.kind === 'boolean' && cp.type.kind === 'boolean' && cp.default !== undefined && String(sp.default) !== cp.default) {
    add('api', 'warning', `Default differs for "${cp.name}": Figma ${sp.default}, code ${cp.default}`);
  }
}
