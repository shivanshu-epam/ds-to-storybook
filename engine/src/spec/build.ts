import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { AxisRole, ComponentTarget } from '../config.ts';
import type { FigmaIR, IRComponentSet, IRStyle, IRValue } from '../ir/types.ts';
import type { Archetype, ComponentSpec, SpecGap, SpecProp, SpecState, StateKind } from './types.ts';

const CANONICAL: Record<string, string> = {
  default: 'default', enabled: 'default', rest: 'default', normal: 'default',
  hover: 'hover', hovered: 'hover',
  pressed: 'pressed', active: 'pressed',
  focus: 'focus', focused: 'focus', 'focus-visible': 'focus',
  disabled: 'disabled',
  error: 'error', invalid: 'error',
  selected: 'checked', checked: 'checked', on: 'checked',
  unselected: 'unchecked', unchecked: 'unchecked', off: 'unchecked',
  indeterminate: 'indeterminate',
  expanded: 'expanded', open: 'expanded', collapsed: 'collapsed', closed: 'collapsed',
  loading: 'loading', skeleton: 'loading',
  'read-only': 'readonly', readonly: 'readonly',
  warning: 'warning',
  filled: 'filled',
};

const KIND: Record<string, StateKind> = {
  default: 'base', unchecked: 'base', collapsed: 'base',
  hover: 'pseudo', pressed: 'pseudo', focus: 'pseudo',
  disabled: 'prop', error: 'prop', checked: 'prop', indeterminate: 'prop', readonly: 'prop', warning: 'prop', loading: 'prop',
  expanded: 'behavioural',
  filled: 'data',
};

/** "Error-Selected" -> ["error", "checked"]; unknown words are kept lower-cased. */
export function canonicalStates(value: string): string[] {
  const whole = CANONICAL[value.trim().toLowerCase()];
  if (whole) return [whole];
  return value.split(/[-+/ ]+/).filter(Boolean).map((w) => CANONICAL[w.toLowerCase()] ?? w.toLowerCase());
}

export function stateKind(canonical: string[]): StateKind {
  const kinds = canonical.map((c) => KIND[c] ?? 'unknown');
  if (kinds.includes('unknown')) return 'unknown';
  for (const k of ['behavioural', 'prop', 'data', 'pseudo'] as const) if (kinds.includes(k)) return k;
  return 'base';
}

export function axisRole(name: string, target: ComponentTarget): AxisRole {
  return target.axisRoles?.[name] ?? (/^(state|interaction|status)$/i.test(name) ? 'state' : 'variant');
}

const KEY_SYNONYMS: Record<string, RegExp> = {
  Enter: /\benter\b|\breturn\b/i,
  Space: /\bspace(bar)?\b/i,
  Tab: /\btab\b/i,
  Escape: /\besc(ape)?\b/i,
  ArrowDown: /arrow ?down|down arrow|↓/i,
  ArrowUp: /arrow ?up|up arrow|↑/i,
  Home: /\bhome\b/i,
  End: /\bend\b/i,
};

export function loadArchetype(dir: string, id: string): Archetype {
  return parseYaml(readFileSync(join(dir, `${id}.yaml`), 'utf8')) as Archetype;
}

function styleValues(style: IRStyle): [string, IRValue<string | number>][] {
  const out: [string, IRValue<string | number>][] = [];
  style.fills.forEach((v) => out.push(['fill', v]));
  style.strokes.forEach((v) => out.push(['stroke', v]));
  for (const key of ['strokeWeight', 'cornerRadius', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing'] as const) {
    const v = style[key];
    if (v) out.push([key, v]);
  }
  return out;
}

/** Raw values that carry design meaning: solid colours and non-zero numbers. */
function meaningful(v: IRValue<string | number>): boolean {
  return typeof v.value === 'number' ? v.value !== 0 : v.value.startsWith('#');
}

export function buildSpec(set: IRComponentSet, ir: FigmaIR, target: ComponentTarget, archetype: Archetype): ComponentSpec {
  const gaps: SpecGap[] = [];
  const props: SpecProp[] = [];
  const states: SpecState[] = [];
  const axes: string[] = [];
  const stateAxes: string[] = [];
  const defaults: Record<string, string> = {};

  for (const p of set.properties) {
    const mapped = target.propMap && p.name in target.propMap ? target.propMap[p.name] : undefined;
    const base = {
      codeProp: mapped,
      mappedBy: mapped !== undefined ? ('config' as const) : ('unmapped' as const),
      figmaProperty: p.name,
      figmaType: p.type,
      default: p.default,
      source: 'figma' as const,
      confidence: 1,
    };
    if (p.type === 'VARIANT') {
      defaults[p.name] = String(p.default);
      if (axisRole(p.name, target) === 'state') {
        stateAxes.push(p.name);
        for (const value of p.options ?? []) {
          const canonical = canonicalStates(value);
          const state: SpecState = { figmaAxis: p.name, figmaValue: value, canonical, kind: stateKind(canonical) };
          if (target.stateMap && value in target.stateMap) state.codeExpression = target.stateMap[value] ?? null;
          states.push(state);
        }
      } else {
        axes.push(p.name);
        props.push({ ...base, type: { kind: 'enum', options: p.options ?? [] } });
      }
    } else {
      const type = p.type === 'BOOLEAN' ? { kind: 'boolean' as const } : p.type === 'TEXT' ? { kind: 'string' as const } : { kind: 'instance' as const };
      props.push({ ...base, type });
    }
  }

  // Variant matrix
  const optionCounts = set.properties.filter((p) => p.type === 'VARIANT').map((p) => p.options?.length ?? 1);
  const fullCount = optionCounts.reduce((a, b) => a * b, 1);

  // Anatomy from the default variant (two levels deep)
  const defaultVariant =
    set.variants.find((v) => Object.entries(defaults).every(([k, val]) => v.values[k] === val)) ?? set.variants[0];
  const anatomy = [...new Set((defaultVariant?.parts ?? []).map((p) => p.path.split('/').slice(0, 2).join('/') + (p.hidden ? ' (optional)' : '')))];

  // Token binding statistics across every variant and part
  let boundCount = 0;
  let rawCount = 0;
  const rawExamples: ComponentSpec['tokens']['rawExamples'] = [];
  const seenRaw = new Set<string>();
  const variableNames = new Set<string>();
  for (const v of set.variants) {
    const nodes: { path: string; style: IRStyle }[] = [{ path: '(root)', style: v.style }, ...v.parts.filter((p) => !p.hidden)];
    for (const { path, style } of nodes) {
      for (const [property, value] of styleValues(style)) {
        if (value.variableId) {
          boundCount++;
          if (value.variableName) variableNames.add(value.variableName);
        } else if (meaningful(value)) {
          rawCount++;
          const key = `${path}|${property}|${value.value}`;
          if (!seenRaw.has(key) && rawExamples.length < 10) {
            seenRaw.add(key);
            rawExamples.push({ variant: v.name, path, property, value: value.value });
          }
        }
      }
    }
  }

  // Docs and keyboard coverage
  const text = set.docFrames.flatMap((f) => f.blocks.map((b) => b.text)).join('\n');
  const keyboard = archetype.keyboard.map((k) => ({
    key: k.key,
    action: k.action,
    documentedInFigma: (KEY_SYNONYMS[k.key] ?? new RegExp(`\\b${k.key}\\b`, 'i')).test(text),
  }));

  // Gaps: what the archetype requires and Figma does not supply
  const present = new Set(states.flatMap((s) => s.canonical));
  for (const required of archetype.requiredStates) {
    if (required !== 'default' && !present.has(required)) {
      gaps.push({ field: `states.${required}`, message: `Figma has no "${required}" state; the archetype requires one.`, source: 'archetype' });
    }
  }
  for (const k of keyboard.filter((k) => !k.documentedInFigma)) {
    gaps.push({ field: `behaviour.keyboard.${k.key}`, message: `Keyboard "${k.key}" (${k.action}) is not mentioned in the Figma docs; archetype default applies.`, source: 'archetype' });
  }
  for (const b of archetype.requiredBehaviour ?? []) {
    const mentioned = new RegExp(b.field.replace(/([A-Z])/g, ' ?$1'), 'i').test(text);
    if (!mentioned) gaps.push({ field: `behaviour.${b.field}`, message: `${b.question} (not found in Figma docs)`, source: 'archetype' });
  }
  if (set.docFrames.length === 0) gaps.push({ field: 'docs', message: 'No documentation frames found for this component.', source: 'figma' });
  const unknownStates = states.filter((s) => s.kind === 'unknown');
  for (const s of unknownStates) {
    gaps.push({ field: `states.${s.figmaValue}`, message: `State value "${s.figmaValue}" on axis "${s.figmaAxis}" is not in the state vocabulary.`, source: 'figma' });
  }

  return {
    specVersion: '0.1',
    id: target.id,
    name: set.name,
    archetype: archetype.id,
    figma: { fileKey: ir.fileKey, nodeId: set.nodeId, ...(set.key ? { key: set.key } : {}), version: ir.version, page: set.page, irHash: set.hash },
    code: { file: target.code?.file ?? '', export: target.code?.export ?? '' },
    props,
    states,
    variantMatrix: { axes, stateAxes, count: set.variants.length, fullCount, default: defaults },
    anatomy,
    tokens: { boundCount, rawCount, rawExamples, variableNames: [...variableNames].sort() },
    docs: { frames: set.docFrames.map((f) => ({ nodeId: f.nodeId, name: f.name, blocks: f.blocks.length })), text },
    behaviour: { pattern: archetype.pattern, keyboard },
    gaps,
    notes: set.notes,
  };
}
