/**
 * Variant styles -> compact CSS.
 *
 * For every (part, CSS property) the generator finds the smallest set of Figma
 * axes the value actually depends on, then emits one rule per combination of
 * those axes. Padding that only varies by Size becomes three rules, not 180.
 * State axes become selectors (":hover", ":disabled", "[data-state=open]"...)
 * supplied by the archetype template.
 */
import type { IRPart, IRStyle, IRValue, IRVariant } from '../ir/types.ts';
import { fontStack, type TokenResolver } from './tokens.ts';

export interface StateSelector {
  /** Role the selector applies to ("root" or a part role). */
  target: string;
  /** Appended to the target, e.g. ':is(:hover, [data-force-state~="hover"])'. */
  selector: string;
}

export interface VariantAxis {
  figma: string;
  /** data attribute name without the data- prefix. */
  attr: string;
  values: Record<string, string>;
}

export interface StateAxis {
  figma: string;
  /** Figma value -> selector; null = the base state; "skip" = do not generate (no code equivalent). */
  states: Record<string, StateSelector | null | 'skip'>;
}

export interface RoleDef {
  role: string;
  kind: 'box' | 'text' | 'icon';
  /** Finds this role's node in a variant. Return undefined when the part is absent. */
  find: (v: IRVariant) => { style: IRStyle; part?: IRPart } | undefined;
  /** Ancestor role, for composing state selectors. Root is implicit. */
  parent?: string;
  /** Emit width/height from Figma (fixed-size parts such as a checkbox box). */
  fixedSize?: boolean;
  /** Emit min-height from Figma (controls with a fixed height). */
  minHeight?: boolean;
  /** Part is optional: absent or hidden variants get display:none. */
  presence?: boolean;
  /** Style hidden layers too (optional slots rendered only when a prop is passed). */
  includeHidden?: boolean;
  /** Display used when present (default: flex for auto-layout, else inline-flex). */
  display?: string;
  /** Extra hints for token matching, e.g. ["interactive"]. */
  hint?: string[];
}

export interface StyleModel {
  /** Class of the element that carries the data attributes (default "root"). Role "root" refers to it. */
  rootClass?: string;
  axes: VariantAxis[];
  stateAxes: StateAxis[];
  roles: RoleDef[];
}

export interface StyleResult {
  css: string;
  /** role.property -> Figma axes it depends on (for docs and review). */
  dependencies: Record<string, string[]>;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const EMPTY = '∅';

const STEM: Record<string, string> = { focused: 'focus', hovered: 'hover', selected: 'checked', unselected: 'unchecked', enabled: 'default', invalid: 'error' };

/** Variant values as weak token hints: "Focused" -> "focus". */
function words(v: IRVariant): string[] {
  return Object.values(v.values).flatMap((x) => x.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean).flatMap((w) => (STEM[w] ? [STEM[w]!, w] : [w]));
}

function color(r: TokenResolver, v: IRValue<string> | undefined, strong: string[], weak: string[]): string | undefined {
  if (!v || !v.value.startsWith('#')) return undefined;
  return r.css(v.value, v.variableId, strong, weak);
}

function length(r: TokenResolver, v: IRValue<number> | undefined, strong: string[], weak: string[]): string | undefined {
  if (!v) return undefined;
  return v.value === 0 ? '0' : r.css(px(v.value), v.variableId, strong, weak);
}

function declarations(role: RoleDef, found: { style: IRStyle; part?: IRPart }, variant: IRVariant, r: TokenResolver): Record<string, string> {
  const s = found.style;
  const roleHint = role.hint ?? [];
  const weak = words(variant);
  const vertical = s.layoutMode === 'VERTICAL';
  const out: Record<string, string> = {};
  if (role.kind === 'text') {
    const c = color(r, s.fills[0], ['fg', 'text', ...roleHint], weak);
    if (c) out.color = c;
    const t = s.text;
    if (t?.fontFamily) out['font-family'] = fontStack(t.fontFamily);
    if (t?.fontSize) out['font-size'] = px(t.fontSize);
    if (t?.fontWeight) out['font-weight'] = String(t.fontWeight);
    if (t?.lineHeightPx) out['line-height'] = px(t.lineHeightPx);
    if (t?.letterSpacing) out['letter-spacing'] = px(t.letterSpacing);
    return out;
  }
  if (role.kind === 'icon') {
    out.transform = s.rotation ? `rotate(${s.rotation}deg)` : 'none';
    if (s.width) out.width = px(s.width);
    if (s.height) out.height = px(s.height);
    const c = color(r, found.part?.innerColor, ['icon', 'fg', ...roleHint], weak);
    if (c) out.color = c;
    return out;
  }
  // box
  out.background = color(r, s.fills[0], ['bg', 'surface', ...roleHint], weak) ?? 'transparent';
  const shadows: string[] = [];
  const stroke = color(r, s.strokes[0], ['border', 'focus', ...roleHint], weak);
  const w = s.strokeWeight?.value ?? 1;
  if (stroke && s.strokeSides) {
    const { top, right, bottom, left } = s.strokeSides;
    if (top) shadows.push(`inset 0 ${px(top)} 0 0 ${stroke}`);
    if (bottom) shadows.push(`inset 0 ${px(-bottom)} 0 0 ${stroke}`);
    if (left) shadows.push(`inset ${px(left)} 0 0 0 ${stroke}`);
    if (right) shadows.push(`inset ${px(-right)} 0 0 0 ${stroke}`);
  } else if (stroke) {
    if (s.strokeAlign === 'OUTSIDE') shadows.push(`0 0 0 ${px(w)} ${stroke}`);
    else if (s.strokeAlign === 'CENTER') shadows.push(`0 0 0 ${px(w / 2)} ${stroke}`, `inset 0 0 0 ${px(w / 2)} ${stroke}`);
    else shadows.push(`inset 0 0 0 ${px(w)} ${stroke}`);
  }
  shadows.push(...(s.shadows ?? []));
  out['box-shadow'] = shadows.length ? shadows.join(', ') : 'none';
  const radius = length(r, s.cornerRadius, ['radius', ...roleHint], weak);
  if (radius) out['border-radius'] = radius;
  if (s.paddingTop || s.paddingRight || s.paddingBottom || s.paddingLeft) {
    const v = (x: IRValue<number> | undefined, h: string[]) => length(r, x, [...h, 'space'], weak) ?? '0';
    out.padding = [v(s.paddingTop, ['block', 'stack', 'inset']), v(s.paddingRight, ['inline', 'inset']), v(s.paddingBottom, ['block', 'stack', 'inset']), v(s.paddingLeft, ['inline', 'inset'])].join(' ');
  }
  const gap = length(r, s.itemSpacing, vertical ? ['stack', 'gap', 'space'] : ['inline', 'gap', 'space'], weak);
  if (gap) out.gap = gap;
  if (s.layoutMode) out['flex-direction'] = s.layoutMode === 'VERTICAL' ? 'column' : 'row';
  if (role.fixedSize && s.width) out.width = px(s.width);
  if (role.fixedSize && s.height) out.height = px(s.height);
  if (role.minHeight && s.height) out['min-height'] = px(s.height);
  out.opacity = s.opacity !== undefined ? String(s.opacity) : '1';
  return out;
}

function subsets<T>(items: T[]): T[][] {
  const out: T[][] = [[]];
  for (const item of items) for (const s of [...out]) out.push([...s, item]);
  return out.sort((a, b) => a.length - b.length);
}

export function generateStyles(variants: IRVariant[], model: StyleModel, resolver: TokenResolver): StyleResult {
  const stateNames = model.stateAxes.map((a) => a.figma);
  const allAxes = [...model.axes.map((a) => a.figma), ...stateNames];
  const usable = variants.filter((v) => model.stateAxes.every((a) => a.states[v.values[a.figma] ?? ''] !== 'skip'));

  // role -> variant index -> declarations
  const table = new Map<string, Record<string, string>[]>();
  for (const role of model.roles) {
    table.set(role.role, usable.map((v) => {
      const found = role.find(v);
      if (!found || (found.part?.hidden && !role.includeHidden)) return role.presence ? { display: 'none' } : {};
      const d = declarations(role, found, v, resolver);
      if (role.presence || d['flex-direction']) d.display = role.display ?? (d['flex-direction'] ? 'flex' : 'inline-flex');
      return d;
    }));
  }

  interface Rule { role: string; axes: Record<string, string>; decls: Record<string, string> }
  const rules: Rule[] = [];
  const dependencies: Record<string, string[]> = {};

  for (const role of model.roles) {
    const rows = table.get(role.role)!;
    const props = [...new Set(rows.flatMap((d) => Object.keys(d)))].sort();
    for (const prop of props) {
      const values = rows.map((d) => d[prop] ?? EMPTY);
      // Smallest axis set the value is a function of.
      const deps = subsets(allAxes).find((set) => {
        const seen = new Map<string, string>();
        return usable.every((v, i) => {
          const key = set.map((a) => v.values[a]).join('|');
          const prev = seen.get(key);
          if (prev === undefined) seen.set(key, values[i]!);
          return prev === undefined || prev === values[i];
        });
      }) ?? allAxes;
      dependencies[`${role.role}.${prop}`] = deps;
      const groups = new Map<string, { axes: Record<string, string>; value: string }>();
      usable.forEach((v, i) => {
        const axes = Object.fromEntries(deps.map((a) => [a, v.values[a]!]));
        groups.set(JSON.stringify(axes), { axes, value: values[i]! });
      });
      for (const { axes, value } of groups.values()) {
        if (value === EMPTY) continue;
        // A non-base state that equals its base is inherited, not emitted.
        const baseAxes = { ...axes };
        for (const sa of model.stateAxes) {
          if (!(sa.figma in axes)) continue;
          const base = Object.entries(sa.states).find(([, sel]) => sel === null)?.[0];
          if (base) baseAxes[sa.figma] = base;
        }
        if (JSON.stringify(baseAxes) !== JSON.stringify(axes)) {
          const base = groups.get(JSON.stringify(baseAxes));
          if (base && base.value === value) continue;
        }
        const key = JSON.stringify(axes);
        const existing = rules.find((r) => r.role === role.role && JSON.stringify(r.axes) === key);
        if (existing) existing.decls[prop] = value;
        else rules.push({ role: role.role, axes, decls: { [prop]: value } });
      }
    }
  }

  const roleDef = new Map(model.roles.map((r) => [r.role, r]));
  const ancestors = (role: string): string[] => {
    const out: string[] = [];
    let p = roleDef.get(role)?.parent;
    while (p) {
      out.push(p);
      p = roleDef.get(p)?.parent;
    }
    return out;
  };

  const selectorFor = (rule: Rule): string => {
    const rootClass = model.rootClass ?? 'root';
    let root = `.${rootClass}`;
    for (const axis of model.axes) {
      const v = rule.axes[axis.figma];
      if (v !== undefined) root += `[data-${axis.attr}="${axis.values[v] ?? v}"]`;
    }
    const conds: StateSelector[] = [];
    for (const sa of model.stateAxes) {
      const v = rule.axes[sa.figma];
      const sel = v !== undefined ? sa.states[v] : null;
      if (sel && sel !== 'skip') conds.push(sel);
    }
    const onRoot = conds.filter((c) => c.target === 'root').map((c) => c.selector).join('');
    const others = conds.filter((c) => c.target !== 'root');
    root += onRoot;
    if (rule.role === 'root') return root + others.map((c) => `:has(.${c.target}${c.selector})`).join('');
    const chain = [...ancestors(rule.role)].reverse();
    const inChain = others.filter((c) => c.target === rule.role || chain.includes(c.target));
    const outside = others.filter((c) => !inChain.includes(c));
    let sel = root + outside.map((c) => `:has(.${c.target}${c.selector})`).join('');
    const targets = new Map(inChain.map((c) => [c.target, c.selector]));
    // Only the nearest in-chain targets need to appear; intermediate ancestors are implicit.
    for (const anc of chain) if (targets.has(anc)) sel += ` .${anc}${targets.get(anc)}`;
    sel += ` .${rule.role}${targets.get(rule.role) ?? ''}`;
    return sel;
  };

  const weight = (r: Rule) => model.stateAxes.filter((sa) => r.axes[sa.figma] !== undefined && sa.states[r.axes[sa.figma]!] !== null).length * 100 + Object.keys(r.axes).length;
  const ordered = rules.sort((a, b) => weight(a) - weight(b) || model.roles.findIndex((x) => x.role === a.role) - model.roles.findIndex((x) => x.role === b.role));

  const css = ordered
    .map((r) => `${selectorFor(r)} {\n${Object.entries(r.decls).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`)
    .join('\n\n');
  return { css: css + '\n', dependencies };
}
