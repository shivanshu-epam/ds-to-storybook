/**
 * Generic template: renders ANY Figma component set from its layer tree.
 *
 * - Variant axes become enum props (data attributes). Axes with Hover/Pressed/Focused values
 *   become CSS pseudo states (forceable for stories); "Disabled" becomes a boolean prop.
 * - Boolean properties toggle the layers bound to them; text properties fill bound text layers.
 * - Icons are the exported Figma SVGs; instances of other generated components render those components.
 * - Behaviour (keyboard, focus, ARIA roles) is NOT inferred: the report and docs say so.
 */
import type { IRComponentSet, IRPart, IRProperty, IRVariant } from '../../ir/types.ts';
import { generateStyles, type Found, type RoleDef, type StateAxis, type StyleModel, type VariantAxis } from '../styles.ts';
import type { IconAsset } from '../icons.ts';
import { docsJson, forced, kebab, mdxPage, pascal, q, type ComponentReport, type TemplateContext, type TemplateResult } from './common.ts';

const PSEUDO: { test: RegExp; state: string; native: string }[] = [
  { test: /^(hover|hovered)$/i, state: 'hover', native: ':hover' },
  { test: /^(pressed|active)$/i, state: 'pressed', native: ':active' },
  { test: /^(focus|focused|focus-visible)$/i, state: 'focus', native: ':focus-visible' },
];
const RESERVED = new Set(['children', 'className', 'style', 'key', 'ref', 'id']);

export const camel = (s: string) => {
  const c = pascal(s);
  return c.charAt(0).toLowerCase() + c.slice(1);
};

export interface AxisValue {
  figma: string;
  value: string;
  role: 'base' | 'pseudo' | 'disabled' | 'enum';
  state?: string;
}

export interface AxisInfo {
  figma: string;
  prop: string;
  attr: string;
  kind: 'variant' | 'state';
  values: AxisValue[];
  /** Enum values the prop accepts (state axes: base + non-pseudo values). */
  options: string[];
  defaultValue: string;
  /** A True/False variant property: a boolean prop (values "true" / "false" in data attributes and CSS). */
  boolean?: boolean;
}

/** How an axis appears in code: True/False axes are booleans, the rest string unions. quote() quotes a string. */
export const axisType = (a: AxisInfo, quote: (s: string) => string) => (a.boolean ? 'boolean' : a.options.map(quote).join(' | '));
export const axisDefault = (a: AxisInfo, quote: (s: string) => string) => (a.boolean ? String(a.defaultValue === 'true') : quote(a.defaultValue));
export const axisLiteral = (a: AxisInfo, value: string, quote: (s: string) => string) => (a.boolean ? String(value === 'true') : quote(value));
/** data-* attribute value from a code reference: booleans render as "true" / "false", as the CSS expects. */
export const axisData = (a: AxisInfo, ref: string) => (a.boolean ? `${ref} ? 'true' : 'false'` : ref);
/** Storybook control for an axis. */
export const axisControl = (a: AxisInfo, quote: (s: string) => string) =>
  a.boolean ? `{ control: 'boolean', description: ${quote(`Figma: ${a.figma}`)} }` : `{ control: '${a.options.length > 5 ? 'select' : 'inline-radio'}', options: [${a.options.map(quote).join(', ')}], description: ${quote(`Figma: ${a.figma}`)} }`;

export function analyzeAxes(set: IRComponentSet): AxisInfo[] {
  const used = new Set<string>();
  return set.properties
    .filter((p) => p.type === 'VARIANT')
    .map((p) => {
      const opts = p.options ?? [];
      const isBool = opts.length === 2 && opts.every((o) => /^(true|false)$/i.test(o));
      // isDisabled=True/False is the disabled state, like State=Disabled.
      if (isBool && /^(is[ _-]?)?disabled$/i.test(p.name)) {
        let prop = camel(p.name);
        if (RESERVED.has(prop) || used.has(prop)) prop = `${prop}Variant`;
        used.add(prop);
        return {
          figma: p.name, prop, attr: kebab(p.name), kind: 'state' as const,
          values: opts.map((o) => (/^true$/i.test(o) ? { figma: o, value: 'disabled', role: 'disabled' as const } : { figma: o, value: 'false', role: 'base' as const })),
          options: ['false'], defaultValue: 'false',
        };
      }
      const isState = !isBool && opts.some((o) => PSEUDO.some((x) => x.test.test(o)) || /^disabled$/i.test(o));
      const values: AxisValue[] = opts.map((o) => {
        const pseudo = PSEUDO.find((x) => x.test.test(o));
        if (isState && o === String(p.default)) return { figma: o, value: kebab(o), role: 'base' };
        if (isState && pseudo) return { figma: o, value: kebab(o), role: 'pseudo', state: pseudo.state };
        if (isState && /^disabled$/i.test(o)) return { figma: o, value: 'disabled', role: 'disabled' };
        return { figma: o, value: kebab(o), role: 'enum' };
      });
      let prop = camel(p.name);
      if (RESERVED.has(prop) || used.has(prop)) prop = `${prop}Variant`;
      used.add(prop);
      return {
        figma: p.name,
        prop,
        attr: kebab(p.name),
        kind: isState ? ('state' as const) : ('variant' as const),
        values,
        options: values.filter((v) => v.role === 'base' || v.role === 'enum').map((v) => v.value),
        defaultValue: kebab(String(p.default)),
        ...(isBool ? { boolean: true } : {}),
      };
    });
}

/** JSX attributes for one Figma variant (used by stories and by nested instances in other components). */
export function variantAttrs(axes: AxisInfo[], values: Record<string, string>): string[] {
  const attrs: string[] = [];
  for (const a of axes) {
    const v = a.values.find((x) => x.figma === values[a.figma]);
    if (!v) continue;
    if (v.role === 'pseudo') attrs.push(`data-force-state="${v.state}"`);
    else if (v.role === 'disabled') attrs.push('disabled');
    else if (a.options.length > 1 && v.value !== a.defaultValue) attrs.push(a.boolean ? `${a.prop}={${v.value === 'true'}}` : `${a.prop}="${v.value}"`);
  }
  return attrs;
}

/** The same, as a props object literal (for story lookup tables). */
function variantObject(a: AxisInfo, figma: string): string {
  const v = a.values.find((x) => x.figma === figma);
  if (!v) return '{}';
  if (v.role === 'pseudo') return `{ 'data-force-state': '${v.state}' }`;
  if (v.role === 'disabled') return '{ disabled: true }';
  return a.options.length > 1 ? `{ ${a.prop}: ${axisLiteral(a, v.value, q)} }` : '{}';
}

export interface PropPlan {
  axes: AxisInfo[];
  booleans: { p: IRProperty; prop: string }[];
  texts: { p: IRProperty; prop: string }[];
  swaps: IRProperty[];
  hasDisabled: boolean;
}

/** Prop names for a set (shared by the component and by places that render it as a nested instance). */
export function propPlan(set: IRComponentSet): PropPlan {
  const axes = analyzeAxes(set);
  const used = new Set(axes.map((a) => a.prop));
  const name = (p: IRProperty) => {
    let n = camel(p.name);
    if (RESERVED.has(n) || used.has(n)) n = `${n}${p.type === 'TEXT' ? 'Text' : 'Prop'}`;
    used.add(n);
    return n;
  };
  return {
    axes,
    booleans: set.properties.filter((p) => p.type === 'BOOLEAN').map((p) => ({ p, prop: name(p) })),
    texts: set.properties.filter((p) => p.type === 'TEXT').map((p) => ({ p, prop: name(p) })),
    swaps: set.properties.filter((p) => p.type === 'INSTANCE_SWAP'),
    hasDisabled: axes.some((a) => a.values.some((v) => v.role === 'disabled')),
  };
}

/** On/off value pairs (kebab-cased Figma values) that mark a binary state axis. */
const ON_OFF: [string, string][] = [['off', 'on'], ['false', 'true'], ['unchecked', 'checked'], ['unselected', 'selected'], ['inactive', 'active']];

/** Switch behaviour pack (WAI-ARIA switch): which Figma axis holds the on/off state. */
export interface SwitchBehavior {
  axis: AxisInfo;
  on: string;
  off: string;
  /** An axis with a "loading" value: the switch is busy (aria-busy) and does not toggle. */
  busy?: AxisInfo;
  /** Default accessible name used in stories (Figma has no label layer). */
  label: string;
  /** Focus ring colour: a focus token, or currentColor. */
  focusColor: string;
}

/** Radio behaviour packs: control (native radio input), field (label), group (radiogroup + shared name and value). */
export interface RadioBehavior {
  kind: 'control' | 'field' | 'group';
  /** Control only: the Figma axis that marks the selected radio (Selected=false/true). */
  axis?: AxisInfo;
  on?: string;
  /** Default accessible name for a standalone control in stories. */
  label: string;
  /** Field: label text copy. Group: group label copy. */
  copy?: string;
  /** The generated radio control component (its module exports the group context). */
  control?: string;
}

/** Text input pack: which Figma layers become the native <input>, its <label>, its description and its controls. */
export interface InputLayers {
  value: string;
  label?: string;
  helper?: string;
  counter?: string;
  required?: string;
  clear?: string;
  /** Props bound to those layers (Figma text and boolean properties). */
  props: { placeholder: string; label?: string; helper?: string; counter?: string; required?: string };
  /** Token for typed text (Figma only draws the placeholder). */
  valueColor: string;
  /** Figma Type axis renamed so it does not clash with the input's type attribute. */
  renamed?: { from: string; to: string };
}

/** One Figma variant as rendered by the "Figma Variants" story. */
export interface VisualVariant {
  nodeId: string;
  name: string;
  width: number;
  height: number;
  /** Figma's painted area relative to the frame: how far it starts left and above, and its size. */
  paintBox?: [number, number, number, number];
}

/** Dialog pack: the native <dialog> and the layers that name it, describe it, close it, and hold its content and actions. */
export interface DialogLayers {
  title?: string;
  body?: string;
  close?: string;
  footer?: string;
  /** Figma Type value that becomes role="alertdialog". */
  alertValue?: string;
  /** Figma State value that sets aria-busy. */
  busyValue?: string;
  /** The Type axis prop (alert detection) and the State axis prop (busy). */
  typeProp?: string;
  stateProp?: string;
  backdrop: string;
}

export type Behavior = 'switch' | 'radio' | 'radio-field' | 'radio-group' | 'input' | 'dialog';

export function switchAxis(axes: AxisInfo[]): { axis: AxisInfo; on: string; off: string } | undefined {
  for (const a of axes) {
    if (a.kind !== 'variant' || a.values.length !== 2) continue;
    const vals = a.values.map((v) => v.value);
    for (const [off, on] of ON_OFF) if (vals.includes(off) && vals.includes(on)) return { axis: a, on, off };
  }
  return undefined;
}

export interface GenericCore {
  set: IRComponentSet;
  css: string;
  layers: LayerInfo[];
  axes: AxisInfo[];
  booleans: { p: IRProperty; prop: string }[];
  texts: { p: IRProperty; prop: string }[];
  hasDisabled: boolean;
  defaults: Record<string, string>;
  assumptions: string[];
  gaps: string[];
  mapping: ComponentReport['props'];
  title: string;
  description: string;
  rowAxis: AxisInfo | undefined;
  colAxis: AxisInfo | undefined;
  multi: AxisInfo[];
  consumed: AxisInfo[];
  /** Set when a behaviour pack applies (template "switch"). */
  behavior?: SwitchBehavior;
  /** Set for templates "radio", "radio-field" and "radio-group". */
  radio?: RadioBehavior;
  /** Set for template "input": the roles of the layers that become the native input, its label, message and so on. */
  input?: InputLayers;
  /** Set for template "dialog". */
  dialog?: DialogLayers;
  /** The Figma variants the "Figma Variants" story renders, for ds-sync visual. */
  visual?: VisualVariant[];
  /** Layer roles the radio packs render specially. */
  radioLayers?: { control?: string; row?: string; label?: string; items?: string; groupLabel?: string; controlComponent?: string; fieldComponent?: string; forwardStates?: string[] };
}

/** A generated component another component can embed. */
export interface RegistryEntry {
  component: string;
  importPath: string;
  kind: 'action' | 'generic' | 'switch' | 'radio' | 'radio-field' | 'radio-group' | 'input' | 'dialog';
  set: IRComponentSet;
}

/** One prop set on a placed instance, independent of the output framework. */
export type InstanceProp =
  | { prop: string; kind: 'string'; value: string }
  | { prop: string; kind: 'boolean'; value: boolean }
  | { prop: string; kind: 'icon'; value: string }
  | { prop: string; kind: 'force-state'; value: string };

export interface InstanceRef {
  component: string;
  importPath: string;
  /** React JSX attributes (derived from props). */
  attrs: string[];
  props: InstanceProp[];
  /** Text content (button label) when the component takes children. */
  text?: string;
  usesIcon: boolean;
  notes: string[];
  kind?: RegistryEntry['kind'];
}

/** Variant values as framework-neutral props. */
export function variantProps(axes: AxisInfo[], values: Record<string, string>): InstanceProp[] {
  const out: InstanceProp[] = [];
  for (const a of axes) {
    const v = a.values.find((x) => x.figma === values[a.figma]);
    if (!v) continue;
    if (v.role === 'pseudo') out.push({ prop: 'data-force-state', kind: 'force-state', value: v.state! });
    else if (v.role === 'disabled') out.push({ prop: 'disabled', kind: 'boolean', value: true });
    else if (a.options.length > 1 && v.value !== a.defaultValue) out.push(a.boolean ? { prop: a.prop, kind: 'boolean', value: v.value === 'true' } : { prop: a.prop, kind: 'string', value: v.value });
  }
  return out;
}

export function reactAttrs(props: InstanceProp[], text?: string): string[] {
  const attrs = props.map((p) =>
    p.kind === 'string' ? `${p.prop}=${JSON.stringify(p.value)}`
      : p.kind === 'boolean' ? (p.value ? p.prop : `${p.prop}={false}`)
      : p.kind === 'icon' ? `${p.prop}={<Icon name="${p.value}" />}`
      : `data-force-state="${p.value}"`,
  );
  if (text !== undefined) attrs.push(`children=${JSON.stringify(text)}`);
  return attrs;
}

/** "close-button" -> "Close". Used as an accessible name for icon-only nested buttons. */
export function humanize(layer: string): string {
  const words = layer.replace(/^_+/, '').replace(/[-_ ]?(button|btn|icon)$/i, '').split(/[-_\s]+/).filter(Boolean);
  const text = words.join(' ').toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : layer;
}

/** JSX attributes for one placed instance: its variant, plus the boolean and text overrides set on it in Figma. */
export function instanceRef(entry: RegistryEntry, part: IRPart, icons: Map<string, IconAsset>): InstanceRef {
  const plan = propPlan(entry.set);
  const variant = entry.set.variants.find((v) => v.nodeId === part.instanceComponentId);
  const sw = entry.kind === 'switch' || entry.kind === 'radio' ? switchAxis(plan.axes) : undefined;
  const props = (variant ? variantProps(plan.axes.filter((a) => a !== sw?.axis), variant.values) : []).map((x) => (entry.kind === 'input' && x.prop === 'type' ? { ...x, prop: 'appearance' } : x));
  const over = part.instanceProps ?? {};
  const notes: string[] = [];
  if (sw && variant) {
    if (kebab(variant.values[sw.axis.figma] ?? '') === sw.on) props.push({ prop: 'defaultChecked', kind: 'boolean', value: true });
  }
  if (sw && variant && entry.kind === 'switch') {
    const label = humanize(part.name);
    props.push({ prop: 'aria-label', kind: 'string', value: label });
    notes.push(`Nested ${entry.component} "${part.path}" is named "${label}" from its Figma layer name; confirm the wording.`);
  }
  let usesIcon = false;
  let text: string | undefined;
  if (entry.kind === 'action') {
    for (const b of plan.booleans.filter((x) => /icon/i.test(x.p.name))) {
      const on = over[b.p.name] ?? b.p.default;
      if (on !== true) continue;
      const side = /leading/i.test(b.p.name) ? /leading/i : /trailing/i;
      const icon = part.innerIcons?.find((i) => side.test(i.layer));
      const asset = icon ? icons.get(icon.name) : undefined;
      if (asset) {
        props.push({ prop: /leading/i.test(b.p.name) ? 'leadingIcon' : 'trailingIcon', kind: 'icon', value: asset.name });
        usesIcon = true;
      }
    }
    const labelBool = plan.booleans.find((x) => /label/i.test(x.p.name));
    const showLabel = labelBool ? (over[labelBool.p.name] ?? labelBool.p.default) !== false : true;
    if (showLabel && part.innerText) text = part.innerText;
    if (!showLabel) {
      const label = humanize(part.name);
      props.push({ prop: 'aria-label', kind: 'string', value: label });
      notes.push(`Icon-only ${entry.component} "${part.path}" is named "${label}" from its Figma layer name; confirm the wording.`);
    }
  } else {
    for (const b of plan.booleans) {
      const v = over[b.p.name];
      if (typeof v === 'boolean' && v !== (String(b.p.default) === 'true')) props.push({ prop: b.prop, kind: 'boolean', value: v });
    }
    for (const t of plan.texts) {
      const v = over[t.p.name];
      if (typeof v === 'string' && v !== String(t.p.default)) props.push({ prop: t.prop, kind: 'string', value: v });
    }
  }
  return { component: entry.component, importPath: entry.importPath, kind: entry.kind, attrs: reactAttrs(props, text), props, ...(text !== undefined ? { text } : {}), usesIcon, notes };
}

/** A value (text or icon) that variant properties decide: an optional overriding prop value, then a table on one prop. */
export interface VariantLookup {
  prop: string;
  values: Record<string, string>;
  fallback: string;
  override?: { prop: string; value: string; result: string };
  /** When a prop is "$checked": the switch's on/off state, as its Figma values. */
  checked?: { on: string; off: string };
}

/** Expression for a lookup; ref turns a prop name into code (React: the variable; Lit: this.prop). */
export function lookupExpr(l: VariantLookup, ref: (prop: string) => string, type: string): string {
  const r = (p: string) => (p === '$checked' && l.checked ? `(${ref(p)} ? ${JSON.stringify(l.checked.on)} : ${JSON.stringify(l.checked.off)})` : ref(p));
  const table = `((${JSON.stringify(l.values)} as Record<string, ${type}>)[String(${r(l.prop)})] ?? ${JSON.stringify(l.fallback)})`;
  return l.override ? `(String(${r(l.override.prop)}) === ${JSON.stringify(l.override.value)} ? ${JSON.stringify(l.override.result)} : ${table})` : table;
}

export interface LayerInfo {
  path: string;
  parent: string;
  part: IRPart;
  role: string;
  /** Further instances with the same path in the default variant (repeated items such as list rows). They share the role's CSS. */
  copies?: IRPart[];
  /** Text (or a nested component's label) that Figma changes with one variant property: prop, value -> text, default text. */
  textByAxis?: VariantLookup;
  /** Icon that Figma swaps with one variant property: prop, value -> icon name, default icon. */
  iconByAxis?: VariantLookup;
  /** Set when one layer is a text in some variants and an instance in others: this entry is the one of this type. */
  splitType?: string;
}

/** Union of layers across all variants, in a stable order (default variant first). */
export function layers(set: IRComponentSet, defaultVariant: IRVariant): LayerInfo[] {
  // A layer that is a text in some variants and an icon or instance in others (Type=Slash "/" vs Type=Chevron)
  // becomes one entry per type; each shows only in its own variants.
  const types = new Map<string, Set<string>>();
  for (const v of set.variants) for (const p of v.parts) types.set(p.path, (types.get(p.path) ?? new Set()).add(p.type));
  const split = (p: IRPart) => (types.get(p.path)!.size > 1 && (p.type === 'TEXT' || p.type === 'INSTANCE') ? p.type : undefined);
  const seen = new Map<string, IRPart>();
  for (const v of [defaultVariant, ...set.variants.filter((x) => x !== defaultVariant)]) {
    for (const p of v.parts) {
      const key = `${p.path}|${split(p) ?? ''}`;
      const prev = seen.get(key);
      // Prefer a visible copy (it carries the real text and colours).
      if (!prev || (prev.hidden && !p.hidden)) seen.set(key, p);
    }
  }
  const used = new Set(['root']);
  return [...seen.values()].map((part) => {
    let base = camel(part.name.replace(/^_+/, '')) || 'layer';
    if (/^[0-9]/.test(base)) base = `l${base}`;
    if (base.length > 40) base = base.slice(0, 40);
    let role = base;
    for (let i = 2; used.has(role); i++) role = `${base}${i}`;
    used.add(role);
    // Copies hidden in Figma (and not shown by a property) are not rendered.
    const same = defaultVariant.parts.filter((p) => p.path === part.path && p.type === 'INSTANCE' && (!p.hidden || p.refs?.visible));
    const splitType = split(part);
    return { path: part.path, parent: part.parent, part, role, ...(same.length > 1 && part.type === 'INSTANCE' ? { copies: same.slice(1) } : {}), ...(splitType ? { splitType } : {}) };
  });
}

export const isIcon = (p: IRPart) => p.type === 'INSTANCE' && Boolean(p.icon || (p.instanceOf && /^icons?\//i.test(p.instanceOf)));
export const SHAPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON', 'REGULAR_POLYGON']);

export function genericTemplate(ctx: TemplateContext, name: string, opts: { title: string; instance: (part: IRPart) => InstanceRef | undefined; behavior?: Behavior; related?: { control?: { name: string; set: IRComponentSet } } }): TemplateResult {
  const set = ctx.sets.main;
  if (!set) throw new Error(`${name}: the generic template needs a "main" component set`);
  const dir = `src/components/${name}`;
  const axes = analyzeAxes(set);
  // A text input already has a "type" attribute (text, email, password): the Figma Type axis becomes "appearance".
  const renamedType = opts.behavior === 'input' ? axes.find((a) => a.prop === 'type') : undefined;
  if (renamedType) renamedType.prop = 'appearance';
  const defaults: Record<string, string> = Object.fromEntries(set.properties.filter((p) => p.type === 'VARIANT').map((p) => [p.name, String(p.default)]));
  const defaultVariant = set.variants.find((v) => Object.entries(defaults).every(([k, x]) => v.values[k] === x)) ?? set.variants[0];
  if (!defaultVariant) throw new Error(`${name}: component set has no variants`);
  const gaps: string[] = [];
  const assumptions: string[] = [];
  const found = opts.behavior === 'switch' ? switchAxis(axes) : undefined;
  if (opts.behavior === 'switch' && !found) gaps.push('Switch template: no on/off variant axis found (for example Value=Off/On), so no switch behaviour was generated.');
  const sw: SwitchBehavior | undefined = found && {
    ...found,
    ...(() => { const busy = axes.find((a) => a !== found.axis && a.options.includes('loading')); return busy ? { busy } : {}; })(),
    label: humanize(name.replace(/([a-z])([A-Z])/g, '$1 $2')),
    focusColor: ctx.resolver.byName(/(^|\/)(border\/)?(interactive\/)?focus(ed)?$/) ?? 'currentColor',
  };
  const radioKind = opts.behavior === 'radio' ? 'control' : opts.behavior === 'radio-field' ? 'field' : opts.behavior === 'radio-group' ? 'group' : undefined;
  const sel = radioKind === 'control' ? switchAxis(axes) : undefined;
  if (radioKind === 'control' && !sel) gaps.push('Radio template: no selected axis found (for example Selected=false/true), so no radio behaviour was generated.');
  const radio: RadioBehavior | undefined = radioKind && (radioKind !== 'control' || sel)
    ? { kind: radioKind, ...(sel ? { axis: sel.axis, on: sel.on } : {}), label: humanize(name.replace(/(Control|Field|Group)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')), ...(opts.related?.control ? { control: opts.related.control.name } : {}) }
    : undefined;
  if (radio) {
    assumptions.push(radio.kind === 'control'
      ? `Behaviour from the WAI-ARIA radio group pattern: a native radio input over the Figma visuals. Figma ${radio.axis!.figma}=${radio.axis!.values.find((v) => v.value === radio.on)?.figma} is :checked.`
      : radio.kind === 'field'
        ? 'The row holding the radio and its text is a <label>, so clicking the text selects the radio.'
        : 'role="radiogroup" named by the group label. Radios inside share one name, so arrow keys move the selection (native radio behaviour); value and onValueChange control it.');
  } else assumptions.push(sw
    ? `Behaviour from the WAI-ARIA switch pattern: a native button with role="switch" and aria-checked. Tab focuses it; Space and Enter toggle it. Figma ${sw.axis.figma}=${sw.axis.values.find((v) => v.value === sw.on)?.figma} is checked.`
    : 'Generated with the generic template: visuals come from Figma; keyboard, focus and ARIA behaviour are not specified.');
  const propAxes = axes.filter((a) => a.options.length > 1 && a !== sw?.axis && a !== radio?.axis);
  const stateProp = propAxes.find((a) => a.prop === 'state');
  const hasState = (v: string) => Boolean(stateProp?.options.includes(v));

  // Props
  const { booleans, texts, swaps, hasDisabled } = propPlan(set);
  // The input pack passes native input attributes through: a Figma property with the same name gets a suffix.
  if (opts.behavior === 'input') {
    const native = new Set(['value', 'defaultValue', 'name', 'type', 'id', 'maxLength', 'checked', 'onChange', 'invalid', 'onClear', 'style', 'className']);
    for (const x of booleans) if (native.has(x.prop)) x.prop = `${x.prop}Prop`;
    for (const x of texts) if (native.has(x.prop)) x.prop = `${x.prop}Text`;
  }
  if (swaps.length) gaps.push(`Instance swap properties not exposed as props (default instance rendered): ${swaps.map((s) => s.name).join(', ')}.`);
  const boolFor = (figma?: string) => booleans.find((b) => b.p.name === figma)?.prop;
  const textFor = (figma?: string) => texts.find((t) => t.p.name === figma)?.prop;

  // Styles
  const all = layers(set, defaultVariant);
  const byPath = new Map(all.map((l) => [l.path, l]));
  /**
   * What a variant property decides: one prop's value -> result, optionally with one overriding value of
   * another prop first (State=Loading -> "Loading…", otherwise by Type). Undefined when no such rule fits.
   */
  const lookupBy = (items: (readonly [IRVariant, string])[], fallback: string): VariantLookup | undefined => {
    const valueOf = (a: AxisInfo, v: IRVariant) => a.values.find((x) => x.figma === v.values[a.figma])?.value;
    // The switch's on/off axis is the "checked" state, not a prop: it is looked up as "$checked".
    const axesForLookup: AxisInfo[] = [...propAxes, ...(sw ? [{ ...sw.axis, prop: '$checked' }] : [])];
    const checked = sw ? { on: sw.on, off: sw.off } : undefined;
    const single = (rows: (readonly [IRVariant, string])[]) => {
      for (const a of axesForLookup) {
        const map = new Map<string, Set<string>>();
        for (const [v, t] of rows) {
          const value = valueOf(a, v);
          if (value) map.set(value, (map.get(value) ?? new Set()).add(t));
        }
        if (map.size && [...map.values()].every((ts) => ts.size === 1)) return { prop: a.prop, values: Object.fromEntries([...map].map(([k, ts]) => [k, [...ts][0]!]).filter(([, t]) => t !== fallback)) };
      }
      return undefined;
    };
    const one = single(items);
    if (one) return { ...one, fallback, ...(checked ? { checked } : {}) };
    for (const a of axesForLookup) {
      for (const value of a.options) {
        const hit = items.filter(([v]) => valueOf(a, v) === value);
        const results = new Set(hit.map(([, t]) => t));
        if (!hit.length || results.size !== 1) continue;
        const rest = single(items.filter(([v]) => valueOf(a, v) !== value));
        if (rest) return { ...rest, fallback, override: { prop: a.prop, value, result: [...results][0]! }, ...(checked ? { checked } : {}) };
      }
    }
    return undefined;
  };
  // Unbound text (or a nested component's label) that Figma changes per variant becomes a lookup.
  for (const l of all) {
    const isText = l.part.type === 'TEXT' && !l.part.refs?.characters;
    const isLabel = l.part.type === 'INSTANCE' && l.part.innerText !== undefined;
    if (!isText && !isLabel) continue;
    const textOf = (v: IRVariant) => { const p = v.parts.find((x) => x.path === l.path && x.type === l.part.type && !x.hidden); return p ? (isText ? p.text : p.innerText) : undefined; };
    const texts = set.variants.map((v) => [v, textOf(v)] as const).filter((x): x is readonly [IRVariant, string] => x[1] !== undefined);
    if (new Set(texts.map(([, t]) => t)).size < 2) continue;
    const found = lookupBy(texts, textOf(defaultVariant) ?? (isText ? l.part.text : l.part.innerText) ?? '');
    if (found) l.textByAxis = found;
  }
  // Icons that Figma swaps per variant (Type=Slash / Chevron, Interaction=Loading) become a lookup too.
  for (const l of all.filter((x) => isIcon(x.part))) {
    const iconOf = (v: IRVariant) => { const p = v.parts.find((x) => x.path === l.path && x.type === 'INSTANCE' && !x.hidden); return p?.instanceOf ? ctx.icons.get(p.instanceOf)?.name : undefined; };
    const fallback = iconOf(defaultVariant) ?? (l.part.instanceOf ? ctx.icons.get(l.part.instanceOf)?.name : undefined);
    const named = set.variants.map((v) => [v, iconOf(v)] as const).filter((x): x is readonly [IRVariant, string] => x[1] !== undefined);
    if (!fallback || new Set(named.map(([, n]) => n)).size < 2) continue;
    const found = lookupBy(named, fallback);
    if (found) l.iconByAxis = found;
  }
  /** JSX expression for a layer's text: the Figma text, or a lookup when a variant property changes it. */
  const reactRef = (p: string) => (p === '$checked' ? 'on' : p);
  const textExpr = (l: LayerInfo, plain: string) => (l.textByAxis ? lookupExpr(l.textByAxis, reactRef, 'string') : plain);
  const partIn = (v: IRVariant, path: string, type?: string) => v.parts.find((p) => p.path === path && (!type || p.type === type));
  const rootStyle = defaultVariant.style;
  const rootDisplay = rootStyle.layoutMode ? (rootStyle.sizingH === 'HUG' ? 'inline-flex' : 'flex') : 'inline-block';
  // Layers Figma reorders between variants (for example Position=Left/Right): each sibling in that group gets a CSS order.
  const siblingOrder = (v: IRVariant, parent: string) => [...new Set(v.parts.filter((p) => p.parent === parent).map((p) => p.path))];
  // A group is reordered when some variant's siblings come in a different order than the rendered (DOM) order,
  // including layers that exist only in some variants (an error banner shown first in State=Error).
  const domOrder = (parent: string) => [...new Set(all.filter((l) => l.parent === parent).map((l) => l.path))];
  const reordered = new Set([...new Set(all.map((l) => l.parent))].filter((parent) => {
    const dom = domOrder(parent);
    return set.variants.some((v) => {
      const seq = siblingOrder(v, parent);
      return seq.join('|') !== dom.filter((p) => seq.includes(p)).join('|');
    });
  }));
  const roles: RoleDef[] = [
    { role: 'root', kind: 'node', display: rootDisplay, find: (v): Found => ({ style: v.style }) },
    ...all.map<RoleDef>((l) => {
      const bound = Boolean(l.part.refs?.visible && boolFor(l.part.refs.visible));
      const nestedComponent = l.part.type === 'INSTANCE' && !isIcon(l.part) && Boolean(l.part.instanceComponentId && opts.instance(l.part));
      const display = nestedComponent || l.part.style.layoutMode ? 'flex' : isIcon(l.part) ? 'inline-flex' : l.part.type === 'TEXT' ? 'block' : 'block';
      return {
        role: l.role,
        kind: 'node',
        display,
        ...(nestedComponent ? { layoutOnly: true } : {}),
        ...(reordered.has(l.parent) ? { order: (v: IRVariant) => { const i = siblingOrder(v, l.parent).indexOf(l.path); return i < 0 ? undefined : i; } } : {}),
        ...(l.parent ? { parent: byPath.get(l.parent)?.role } : {}),
        presence: !bound,
        includeHidden: bound,
        find: (v): Found | undefined => {
          const p = partIn(v, l.path, l.splitType);
          if (!p) return undefined;
          const parentStyle = l.parent ? partIn(v, l.parent)?.style : v.style;
          return { style: p.style, part: p, ...(parentStyle ? { parentStyle } : {}) };
        },
      };
    }),
  ];
  const focusNative = radio?.kind === 'control' ? ':has(> .input:focus-visible)' : radio || opts.behavior === 'input' ? ':focus-within' : ':focus-visible';
  const model: StyleModel = {
    axes: axes.filter((a) => a.kind === 'variant' && a !== radio?.axis).map<VariantAxis>((a) => ({ figma: a.figma, attr: a.attr, values: Object.fromEntries(a.values.map((v) => [v.figma, v.value])) })),
    stateAxes: axes.filter((a) => a.kind === 'state').map<StateAxis>((a) => ({
      figma: a.figma,
      states: Object.fromEntries(a.values.map((v) => [v.figma, v.role === 'base' ? null : v.role === 'pseudo' ? forced(v.state!, v.state === 'focus' ? focusNative : `${PSEUDO.find((x) => x.state === v.state)!.native}:not([data-disabled])`) : v.role === 'disabled' ? { target: 'root', selector: '[data-disabled]' } : { target: 'root', selector: `[data-${a.attr}="${v.value}"]` }])),
    })).concat(radio?.axis ? [{ figma: radio.axis.figma, states: Object.fromEntries(radio.axis.values.map((v) => [v.figma, v.value === radio.on ? { target: 'root', selector: ':has(> .input:checked)' } : null])) }] : []),
    roles,
  };
  const styles = generateStyles(set.variants, model, ctx.resolver);

  // Radio packs: which layers get special rendering.
  const kindOf = (l: LayerInfo) => (l.part.type === 'INSTANCE' && !isIcon(l.part) && l.part.instanceComponentId ? opts.instance(l.part)?.kind : undefined);
  const controlLayer = radio?.kind === 'field' ? all.find((l) => kindOf(l) === 'radio') : undefined;
  const rowPath = controlLayer?.parent;
  const labelLayer = controlLayer ? all.find((l) => l.parent === rowPath && l.part.type === 'TEXT') ?? all.find((l) => l.part.type === 'TEXT') : undefined;
  const itemsLayer = radio?.kind === 'group' ? all.find((l) => l.part.type !== 'TEXT' && l.part.type !== 'INSTANCE' && all.some((c) => c.parent === l.path && kindOf(c) === 'radio-field')) : undefined;
  const groupLabelLayer = radio?.kind === 'group' ? all.find((l) => l.parent === '' && l.part.type === 'TEXT') : undefined;
  if (radio?.kind === 'field' && !controlLayer) gaps.push('Radio field: no nested radio control found, so the label is not linked to a radio.');
  if (radio?.kind === 'group' && !itemsLayer) gaps.push('Radio group: no layer holding radio fields found; children render at the end.');
  if (radio?.kind === 'group' && !radio.control) gaps.push('Radio group: no generated radio control found, so the group cannot share its name and value through context.');
  if (radio) radio.copy = (labelLayer ?? groupLabelLayer)?.part.text ?? undefined;
  const controlName = controlLayer ? opts.instance(controlLayer.part)?.component : undefined;
  const controlAxes = opts.related?.control ? analyzeAxes(opts.related.control.set) : [];
  const forwardState = Boolean(stateProp && controlAxes.find((a) => a.prop === 'state')?.options.some((o) => stateProp.options.includes(o) && o !== stateProp.defaultValue));
  const controlStates = controlAxes.find((a) => a.prop === 'state')?.options ?? [];

  // Input pack: layers found by the Figma properties bound to them.
  const textBound = (re: RegExp) => { const t = texts.find((x) => re.test(x.p.name)); return t ? { t, l: all.find((l) => l.part.type === 'TEXT' && l.part.refs?.characters === t.p.name) } : undefined; };
  const visBound = (re: RegExp) => { const b = booleans.find((x) => re.test(x.p.name)); return b ? { b, l: all.find((l) => l.part.refs?.visible === b.p.name) } : undefined; };
  const ph = opts.behavior === 'input' ? textBound(/placeholder/i) : undefined;
  if (opts.behavior === 'input' && !ph?.l) gaps.push('Input template: no text layer bound to a Placeholder property, so no native input was generated.');
  const lab = ph?.l ? textBound(/^label$/i) : undefined;
  const help = ph?.l ? textBound(/helper|hint|description/i) : undefined;
  const count = ph?.l ? textBound(/count/i) : undefined;
  const req = ph?.l ? visBound(/required/i) : undefined;
  const clr = ph?.l ? visBound(/clear/i) : undefined;
  const input: InputLayers | undefined = ph?.l ? {
    value: ph.l.role,
    ...(lab?.l ? { label: lab.l.role } : {}),
    ...(help?.l ? { helper: help.l.role } : {}),
    ...(count?.l ? { counter: count.l.role } : {}),
    ...(req?.l ? { required: req.l.role } : {}),
    ...(clr?.l && clr.l.part.type === 'INSTANCE' ? { clear: clr.l.role } : {}),
    props: { placeholder: ph.t.prop, ...(lab ? { label: lab.t.prop } : {}), ...(help ? { helper: help.t.prop } : {}), ...(count ? { counter: count.t.prop } : {}), ...(req ? { required: req.b.prop } : {}) },
    valueColor: ctx.resolver.byName(/^text\/(primary|default)$/) ?? 'inherit',
    ...(renamedType ? { renamed: { from: 'type', to: 'appearance' } } : {}),
  } : undefined;
  const inputRole = (l: LayerInfo) => (input ? (Object.entries(input).find(([k, v]) => typeof v === 'string' && v === l.role && k !== 'valueColor')?.[0]) : undefined);
  // Dialog pack.
  const isDialog = opts.behavior === 'dialog';
  const dTitle = isDialog ? textBound(/title|heading/i) : undefined;
  const dBodyText = isDialog ? textBound(/body|content|description|message/i) : undefined;
  const dBody = dBodyText?.l ? byPath.get(dBodyText.l.parent) : undefined;
  const dClose = isDialog ? visBound(/close|dismiss/i) : undefined;
  const dFooter = isDialog ? all.find((l) => l.parent === '' && l.part.type !== 'TEXT' && l.part.type !== 'INSTANCE' && (/footer|actions/i.test(l.part.name) || all.some((c) => c.parent === l.path && kindOf(c) === 'action'))) : undefined;
  const typeAxis = propAxes.find((a) => a.figma.toLowerCase() === 'type');
  const dialog: DialogLayers | undefined = isDialog ? {
    ...(dTitle?.l ? { title: dTitle.l.role } : {}),
    ...(dBody ? { body: dBody.role } : {}),
    ...(dClose?.l && dClose.l.part.type === 'INSTANCE' ? { close: dClose.l.role } : {}),
    ...(dFooter ? { footer: dFooter.role } : {}),
    ...(typeAxis?.options.includes('alert') ? { alertValue: 'alert', typeProp: typeAxis.prop } : {}),
    ...(stateProp?.options.includes('loading') ? { busyValue: 'loading', stateProp: stateProp.prop } : {}),
    backdrop: ctx.resolver.byName(/^overlay\/default$/) ?? ctx.resolver.byName(/overlay/) ?? 'rgb(0 0 0 / 50%)',
  } : undefined;
  if (dialog) {
    assumptions.push(`Behaviour from the WAI-ARIA dialog pattern on a native <dialog>: open (modal by default) uses showModal(), so focus moves in and stays in, the page behind is inert, Escape closes it and focus returns to the opener. ${dialog.title ? 'The title names it; ' : ''}${dialog.body ? 'the body describes it. ' : ''}${dialog.alertValue ? 'Type=Alert is role="alertdialog". ' : ''}${dialog.busyValue ? 'State=Loading sets aria-busy. ' : ''}The backdrop uses ${dialog.backdrop}.`);
    assumptions.push('Stories that show many variants render them as open, non-modal dialogs in the page; the Default story opens a real modal from a button.');
    if (dialog.close) gaps.push(`The close button's accessible name "Close" comes from its Figma layer name "${dClose!.l!.part.name}"; confirm the wording.`);
    if (dialog.footer) gaps.push('The Figma footer buttons have no actions; pass `footer` with your own buttons (and close the dialog from them).');
    if (typeAxis?.options.some((o) => /drawer|full/.test(o))) gaps.push('Placement of the drawer and full-screen types is not in Figma: a drawer opens at the right edge, full-screen fills the viewport.');
  }
  if (input) {
    assumptions.push(`A native <input> replaces the Figma "${ph!.l!.part.name}" text layer; ${input.label ? 'the label layer is its <label>, ' : ''}${input.helper ? 'the helper text describes it (aria-describedby), ' : ''}and typed text uses ${input.valueColor} (Figma only draws the placeholder).`);
    if (renamedType) assumptions.push('The Figma Type axis is the "appearance" prop, so "type" stays the native input type (text, email, password...).');
    if (input.clear) gaps.push(`The clear control's accessible name "Clear" comes from its Figma layer name "${clr!.l!.part.name}"; confirm the wording.`);
  }

  // JSX
  const imports = new Set<string>();
  let usesIcon = false;
  const children = (parent: string) => all.filter((l) => l.parent === parent);
  const render = (l: LayerInfo, indent: string): string => {
    const p = l.part;
    const cls = `className={styles.${l.role}}`;
    let el: string;
    const ir = inputRole(l);
    if (dialog && l.role === dialog.title && p.type === 'TEXT') {
      const t = textFor(p.refs?.characters);
      el = `<span className={styles.${l.role}} id={titleId}>{${t ?? JSON.stringify(p.text ?? '')}}</span>`;
    } else if (dialog && l.role === dialog.close && p.instanceOf && ctx.icons.get(p.instanceOf)) {
      usesIcon = true;
      el = `<button type="button" className={styles.${l.role}} aria-label="Close" onClick={() => setOpen(false)}><Icon name="${ctx.icons.get(p.instanceOf)!.name}" /></button>`;
    } else if (ir === 'value') {
      el = `<input
${indent}  ref={ref}
${indent}  id={inputId}
${indent}  className={styles.${l.role}}
${indent}  placeholder={${input!.props.placeholder}}
${indent}  disabled={disabled}
${input!.props.required ? `${indent}  required={${input!.props.required}}\n` : ''}${indent}  aria-invalid={invalid || undefined}
${indent}  aria-describedby={describedBy}
${indent}  onChange={(event) => {
${indent}    setLength(event.target.value.length);
${indent}    onChange?.(event);
${indent}  }}
${indent}  {...rest}
${indent}/>`;
    } else if (ir === 'label') {
      el = `<label className={styles.${l.role}} htmlFor={inputId}>{${input!.props.label}}</label>`;
    } else if (ir === 'helper') {
      el = `<span className={styles.${l.role}} id={helperId}>{${input!.props.helper}}</span>`;
    } else if (ir === 'counter') {
      el = `<span className={styles.${l.role}}>{maxLength !== undefined ? \`\${length}/\${maxLength}\` : ${input!.props.counter}}</span>`;
    } else if (ir === 'required') {
      el = `<span className={styles.${l.role}} aria-hidden="true">{${JSON.stringify(p.text ?? '*')}}</span>`;
    } else if (ir === 'clear' && p.instanceOf && ctx.icons.get(p.instanceOf)) {
      usesIcon = true;
      el = `<button type="button" className={styles.${l.role}} aria-label="Clear" disabled={disabled} onClick={clear}><Icon name="${ctx.icons.get(p.instanceOf)!.name}" /></button>`;
    } else if (p.type === 'TEXT' && (l === labelLayer || l === groupLabelLayer)) {
      el = `<span ${cls}${l === groupLabelLayer ? ' id={labelId}' : ''}>{label ?? ${JSON.stringify(p.text ?? '')}}</span>`;
    } else if (p.type === 'TEXT') {
      const t = textFor(p.refs?.characters);
      el = `<span ${cls}>{${t ?? textExpr(l, JSON.stringify(p.text ?? ''))}}</span>`;
    } else if (p.type === 'INSTANCE') {
      const icon = p.instanceOf ? ctx.icons.get(p.instanceOf) : undefined;
      const nested = !isIcon(p) && p.instanceComponentId ? opts.instance(p) : undefined;
      if (icon) {
        usesIcon = true;
        el = l.iconByAxis
          ? `<span ${cls} aria-hidden="true"><Icon name={${lookupExpr(l.iconByAxis, reactRef, 'IconName')}} /></span>`
          : `<span ${cls} aria-hidden="true"><Icon name="${icon.name}" /></span>`;
      } else if (nested && nested.component !== name) {
        imports.add(`import { ${nested.component} } from '${nested.importPath}';`);
        if (nested.usesIcon) usesIcon = true;
        gaps.push(...nested.notes);
        const one = (n: InstanceRef) => {
          const attrs = l.textByAxis && n.text !== undefined ? n.attrs.map((x) => (x.startsWith('children=') ? `children={${textExpr(l, '')}}` : x)) : n.attrs;
          return `<span ${cls}><${n.component}${attrs.length ? ' ' + attrs.join(' ') : ''}${l === controlLayer ? ' {...control}' : ''} /></span>`;
        };
        // Repeated instances (for example three radio fields in a group) render once each, sharing the role's CSS.
        // Each copy keeps its own boolean (Figma table rows bind column1…column7 to separate cells).
        if (l.copies?.length) {
          const guard = (part: IRPart, x: string) => { const b = boolFor(part.refs?.visible); return b ? `{${b} && (${x})}` : x; };
          const all2 = [[p, nested] as const, ...l.copies.map((c) => [c, opts.instance(c)] as const)].filter((x): x is readonly [IRPart, InstanceRef] => Boolean(x[1]));
          return `${indent}<>\n${all2.map(([part, n]) => `${indent}  ${guard(part, one(n))}`).join('\n')}\n${indent}</>`;
        }
        el = one(nested);
      } else {
        gaps.push(`Layer "${p.path}" is an instance of "${p.instanceOf ?? 'unknown'}", which is not generated here; rendered as an empty box.`);
        el = `<span ${cls} aria-hidden="true" />`;
      }
    } else if (SHAPES.has(p.type) && children(l.path).some((k) => k.part.type === 'INSTANCE')) {
      // A shape group used as a mask around an icon (Figma boolean operations): render what is inside it.
      el = `<span ${cls}>\n${children(l.path).map((k) => render(k, indent + '  ')).join('\n')}\n${indent}</span>`;
    } else if (SHAPES.has(p.type)) {
      gaps.push(`Layer "${p.path}" is a ${p.type.toLowerCase()} shape; approximated with its fill and size (no vector path).`);
      el = `<span ${cls} aria-hidden="true" />`;
    } else {
      const kids = children(l.path);
      const box = l.path === rowPath ? 'label' : sw || radio?.kind === 'control' ? 'span' : 'div'; // a <button> may only hold phrasing content
      const inner = kids.map((k) => render(k, indent + '  ')).join('\n');
      const slotted = l === itemsLayer ? 'children' : dialog && l.role === dialog.body ? 'children' : dialog && l.role === dialog.footer ? 'footer' : undefined;
      const idAttr = dialog && l.role === dialog.body ? ' id={bodyId}' : '';
      el = slotted
        ? `<${box} ${cls}${idAttr}>\n${indent}  {${slotted} ?? (\n${indent}    <>\n${kids.map((k) => render(k, indent + '      ')).join('\n')}\n${indent}    </>\n${indent}  )}\n${indent}</${box}>`
        : l === itemsLayer
        ? `<${box} ${cls}>\n${indent}  {children ?? (\n${indent}    <>\n${kids.map((k) => render(k, indent + '      ')).join('\n')}\n${indent}    </>\n${indent}  )}\n${indent}</${box}>`
        : kids.length ? `<${box} ${cls}>\n${inner}\n${indent}</${box}>` : `<${box} ${cls} />`;
    }
    const b = boolFor(p.refs?.visible);
    return b ? `${indent}{${b} && (\n${indent}  ${el.replace(/\n/g, `\n  `)}\n${indent})}` : `${indent}${el}`;
  };
  const body = children('').map((l) => render(l, '      ')).join('\n');

  if (set.variants.length < axes.reduce((n, a) => n * a.values.length, 1)) {
    assumptions.push(`The Figma set has ${set.variants.length} of ${axes.reduce((n, a) => n * a.values.length, 1)} possible variant combinations; other combinations use the nearest defined styles.`);
  }
  const figmaFocus = axes.some((a) => a.values.some((v) => v.state === 'focus'));
  if (sw && !figmaFocus) assumptions.push(`Figma has no focus state; a 2px focus ring (${sw.focusColor}) is added for keyboard users.`);
  if (sw) gaps.push(`Figma has no label for ${name}: give each one an accessible name with aria-label or aria-labelledby.`);
  if (!sw && figmaFocus) {
    assumptions.push('A focus style exists in Figma, but the generic element is not focusable; it shows only when forced (data-force-state="focus") until behaviour is specified.');
  }

  const propLines = [
    ...(sw ? [
      `  /** On or off (controlled). Figma: ${sw.axis.figma}. */\n  checked?: boolean;`,
      '  /** Initial state when uncontrolled. Default false. */\n  defaultChecked?: boolean;',
      '  /** Called with the new state when the user toggles the switch. */\n  onCheckedChange?: (checked: boolean) => void;',
    ] : []),
    ...propAxes.map((a) => `  /** Figma: ${a.figma}. Default ${a.defaultValue}.${a === sw?.busy ? ' "loading" sets aria-busy and blocks toggling.' : ''} */\n  ${a.prop}?: ${axisType(a, q)};`),
    ...(hasDisabled ? ['  /** Figma: State=Disabled. */\n  disabled?: boolean;'] : []),
    ...booleans.map((b) => `  /** Figma: ${b.p.name} (boolean). Default ${b.p.default}. */\n  ${b.prop}?: boolean;`),
    ...texts.map((t) => `  /** Figma: ${t.p.name} (text). */\n  ${t.prop}?: ReactNode;`),
    `  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */\n  'data-force-state'?: string;`,
  ];
  const ownProps = [...(sw ? ['checked', 'defaultChecked', 'value', 'onChange'] : []), ...propAxes.map((a) => a.prop), ...(hasDisabled ? ['disabled'] : []), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop)];
  const destructure = [
    ...(sw ? ['checked', 'defaultChecked = false', 'onCheckedChange', 'onClick'] : []),
    ...propAxes.map((a) => `${a.prop} = ${axisDefault(a, q)}`),
    ...(hasDisabled ? ['disabled = false'] : []),
    ...booleans.map((b) => `${b.prop} = ${String(b.p.default) === 'true'}`),
    ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`),
    'className',
    '...rest',
  ];
  const dataAttrs = [
    ...(sw ? [`data-${sw.axis.attr}={on ? ${q(sw.on)} : ${q(sw.off)}}`] : []),
    ...propAxes.map((a) => `data-${a.attr}={${axisData(a, a.prop)}}`),
    ...(hasDisabled ? ["data-disabled={disabled ? '' : undefined}", sw ? 'disabled={disabled}' : 'aria-disabled={disabled || undefined}'] : []),
    ...(sw?.busy ? ['aria-busy={busy || undefined}'] : []),
  ];

  const radioTsx = radio ? radioComponent() : input ? inputComponent() : dialog ? dialogComponent() : undefined;
  const tsx = radioTsx ?? (sw ? `// Generated by ds-sync (switch template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
// Visuals come from Figma. Behaviour: WAI-ARIA switch pattern (native button, role="switch", aria-checked).
import { useState, type ButtonHTMLAttributes${texts.length ? ', type ReactNode' : ''} } from 'react';

${usesIcon ? `import { Icon } from '../../icons/Icon';\n` : ''}${all.some((l) => l.iconByAxis) ? `import type { IconName } from '../../icons/icons';\n` : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import styles from './${name}.module.css';

export interface ${name}Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'${ownProps.map((p) => ` | '${p}'`).join('')}> {
${propLines.join('\n')}
}

export function ${name}({ ${destructure.join(', ')} }: ${name}Props) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
${sw.busy ? `  const busy = ${sw.busy.prop} === 'loading';\n` : ''}  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={[styles.root, className].filter(Boolean).join(' ')}
      ${dataAttrs.join('\n      ')}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented${sw.busy ? ' || busy' : ''}) return;
        if (checked === undefined) setInner(!on);
        onCheckedChange?.(!on);
      }}
    >
${body}
    </button>
  );
}
` : `// Generated by ds-sync (generic template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
// Visuals come from Figma. Behaviour (keyboard, focus, ARIA role) is not specified in Figma and is not generated.
import type { HTMLAttributes${texts.length ? ', ReactNode' : ''} } from 'react';

${usesIcon ? `import { Icon } from '../../icons/Icon';\n` : ''}${all.some((l) => l.iconByAxis) ? `import type { IconName } from '../../icons/icons';\n` : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import styles from './${name}.module.css';

export interface ${name}Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'${ownProps.map((p) => ` | '${p}'`).join('')}> {
${propLines.join('\n')}
}

export function ${name}({ ${destructure.join(', ')} }: ${name}Props) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}${dataAttrs.length ? ' ' + dataAttrs.join(' ') : ''} {...rest}>
${body}
    </div>
  );
}
`);

  function dialogComponent(): string {
    const d = dialog!;
    const set = ctx.sets.main!;
    const own = [...propAxes.map((a) => a.prop), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop), 'open'];
    const lines = [
      '  /** Open (controlled). */\n  open?: boolean;',
      '  /** Initially open (uncontrolled). Default false. */\n  defaultOpen?: boolean;',
      '  /** Modal (default): focus stays inside, the page behind is inert, and a backdrop shows. */\n  modal?: boolean;',
      '  /** Called when the dialog opens or closes (close button, Escape, or your code). */\n  onOpenChange?: (open: boolean) => void;',
      ...(d.body ? ['  /** Dialog content. Default: the Figma body. */\n  children?: ReactNode;'] : []),
      ...(d.footer ? ['  /** Action buttons. Default: the Figma buttons (no actions). */\n  footer?: ReactNode;'] : []),
      ...propLines.filter((x) => !x.includes('disabled?: boolean;')),
    ];
    const destructure = [...propAxes.map((a) => `${a.prop} = ${axisDefault(a, q)}`), ...booleans.map((b) => `${b.prop} = ${String(b.p.default) === 'true'}`), ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`), 'open', 'defaultOpen = false', 'modal = true', 'onOpenChange', ...(d.body ? ['children'] : []), ...(d.footer ? ['footer'] : []), 'className', 'onClose', 'onKeyDown', '...rest'];
    return `// Generated by ds-sync (dialog template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
// Visuals come from Figma. Behaviour: WAI-ARIA dialog pattern on a native <dialog> (showModal).
import { useEffect, useId, useRef, useState, type DialogHTMLAttributes, type ReactNode } from 'react';

${usesIcon ? `import { Icon } from '../../icons/Icon';\n` : ''}${all.some((l) => l.iconByAxis) ? `import type { IconName } from '../../icons/icons';\n` : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import styles from './${name}.module.css';

export interface ${name}Props extends Omit<DialogHTMLAttributes<HTMLDialogElement>, 'children' | 'title'${own.map((x) => ` | '${x}'`).join('')}> {
${lines.join('\n')}
}

export function ${name}({ ${destructure.join(', ')} }: ${name}Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const id = useId();
  const titleId = \`\${id}-title\`;
  const bodyId = \`\${id}-body\`;
  const setOpen = (next: boolean) => {
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      if (modal) dialog.showModal();
      else dialog.show();
    } else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen, modal]);
  return (
    <dialog
      ref={ref}
${d.alertValue ? `      role={${d.typeProp} === '${d.alertValue}' ? 'alertdialog' : undefined}\n` : ''}${d.title ? '      aria-labelledby={titleId}\n' : ''}${d.body ? '      aria-describedby={bodyId}\n' : ''}${d.busyValue ? `      aria-busy={${d.stateProp} === '${d.busyValue}' || undefined}\n` : ''}      className={[styles.root, className].filter(Boolean).join(' ')}
      ${propAxes.map((a) => `data-${a.attr}={${axisData(a, a.prop)}}`).join('\n      ')}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        // WAI-ARIA dialog: Escape closes it (modal or not).
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          setOpen(false);
        }
      }}
      onClose={(event) => {
        // form method="dialog" or close(): keep the state in step.
        if (isOpen) setOpen(false);
        onClose?.(event);
      }}
      {...rest}
    >
${body}
    </dialog>
  );
}
`;
  }

  function inputComponent(): string {
    const ip = input!;
    const set = ctx.sets.main!;
    const errorValue = stateProp?.options.find((o) => /^(error|invalid)$/.test(o));
    const own = [...propAxes.map((a) => a.prop), 'disabled', ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop)];
    const lines = [
      ...propAxes.map((a) => `  /** Figma: ${a.figma}. Default ${a.defaultValue}.${a === renamedType ? ' (Figma "Type"; "type" is the native input type.)' : ''}${a === stateProp && errorValue ? ` "${errorValue}" also sets aria-invalid.` : ''} */\n  ${a.prop}?: ${axisType(a, q)};`),
      '  /** Figma: State=Disabled. */\n  disabled?: boolean;',
      ...booleans.map((b) => `  /** Figma: ${b.p.name} (boolean). Default ${b.p.default}.${b.prop === ip.props.required ? ' Also sets the native required attribute.' : ''} */\n  ${b.prop}?: boolean;`),
      ...texts.map((t) => `  /** Figma: ${t.p.name} (text).${t.prop === ip.props.counter ? ' Shown when maxLength is not set; with maxLength the count is live.' : ''} */\n  ${t.prop}?: ${t.prop === ip.props.placeholder || t.prop === ip.props.counter ? 'string' : 'ReactNode'};`),
      '  /** Marks the input invalid (aria-invalid) without changing its look. */\n  invalid?: boolean;',
      ...(ip.clear ? ['  /** Called after the clear button empties the input. */\n  onClear?: () => void;'] : []),
      `  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */\n  'data-force-state'?: string;`,
    ];
    const destructure = [...propAxes.map((a) => `${a.prop} = ${axisDefault(a, q)}`), 'disabled = false', ...booleans.map((b) => `${b.prop} = ${String(b.p.default) === 'true'}`), ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`), 'invalid: invalidProp', ...(ip.clear ? ['onClear'] : []), 'id', 'className', 'style', 'value', 'defaultValue', 'maxLength', 'onChange', "'aria-describedby': ariaDescribedBy", "'data-force-state': forceState", '...rest'];
    return `// Generated by ds-sync (input template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
// Visuals come from Figma. Behaviour: a native <input> with its <label>, description and validity.
import { useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';

${usesIcon ? `import { Icon } from '../../icons/Icon';\n` : ''}${all.some((l) => l.iconByAxis) ? `import type { IconName } from '../../icons/icons';\n` : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import styles from './${name}.module.css';

export interface ${name}Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'children'${own.map((x) => ` | '${x}'`).join('')}> {
${lines.join('\n')}
}

export function ${name}({ ${destructure.join(', ')} }: ${name}Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helperId = ${ip.helper ? '`${inputId}-helper`' : 'undefined'};
  const describedBy = [helperId, ariaDescribedBy].filter(Boolean).join(' ') || undefined;
  const invalid = Boolean(invalidProp)${errorValue ? ` || ${stateProp!.prop} === '${errorValue}'` : ''};
  const ref = useRef<HTMLInputElement>(null);
  const [length, setLength] = useState(String(value ?? defaultValue ?? '').length);
${ip.clear ? `  const clear = () => {
    if (ref.current && value === undefined) ref.current.value = '';
    setLength(0);
    onClear?.();
    ref.current?.focus();
  };
` : ''}  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} style={style} ${[...propAxes.map((a) => `data-${a.attr}={${axisData(a, a.prop)}}`), "data-disabled={disabled ? '' : undefined}", "data-invalid={invalid ? '' : undefined}", 'data-force-state={forceState}'].join(' ')}>
${body.replace(/\{\.\.\.rest\}/, '{...rest}\n' + '          value={value}\n          defaultValue={defaultValue}\n          maxLength={maxLength}')}
    </div>
  );
}
`;
  }

  function radioComponent(): string {
    const r = radio!;
    const set = ctx.sets.main!;
    const head = `// Generated by ds-sync (radio template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
// Visuals come from Figma. Behaviour: WAI-ARIA radio group pattern with native radio inputs.`;
    const iconImports = `${usesIcon ? `import { Icon } from '../../icons/Icon';\n` : ''}${all.some((l) => l.iconByAxis) ? `import type { IconName } from '../../icons/icons';\n` : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}`;
    const axisProps = propAxes.map((a) => `${a.prop} = ${axisDefault(a, q)}`);
    const dataOfAxes = propAxes.map((a) => `data-${a.attr}={${axisData(a, a.prop)}}`);
    const extraProps = [...booleans.map((b) => `${b.prop} = ${String(b.p.default) === 'true'}`), ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`)];
    const own = [...propAxes.map((a) => a.prop), 'disabled', ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop)];
    const lines = propLines.filter((x) => !x.includes('disabled?: boolean;'));
    if (r.kind === 'control') {
      return `${head}
import { createContext, useContext, type InputHTMLAttributes${texts.length ? ', type ReactNode' : ''} } from 'react';

${iconImports}import styles from './${name}.module.css';

/** Provided by a radio group: the shared name and value, and group-wide state. */
export const ${name}Context = createContext<{ name?: string; value?: string; onValueChange?: (value: string) => void; disabled?: boolean; readOnly?: boolean }>({});

export interface ${name}Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'children'${own.map((x) => ` | '${x}'`).join('')}> {
  /** Selected (native). Figma: ${r.axis!.figma}=${r.axis!.values.find((v) => v.value === r.on)?.figma}. Use defaultChecked when uncontrolled. */
  checked?: boolean;
${lines.join('\n')}
  /** Figma: State=Disabled. */
  disabled?: boolean;
}

export function ${name}({ ${[...axisProps, 'disabled = false', ...extraProps, 'className', 'style', 'name', 'value', 'checked', 'onChange', 'onClick', 'onKeyDown', "'data-force-state': forceState", '...rest'].join(', ')} }: ${name}Props) {
  const group = useContext(${name}Context);
  const isDisabled = disabled || Boolean(group.disabled);
  const readOnly = ${hasState('read-only') ? `${stateProp!.prop} === 'read-only' || ` : ''}Boolean(group.readOnly);
  const inGroup = group.value !== undefined && value !== undefined;
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')} style={style} ${[...dataOfAxes, "data-disabled={isDisabled ? '' : undefined}", 'data-force-state={forceState}'].join(' ')}>
      <input
        type="radio"
        className={styles.input}
        name={name ?? group.name}
        value={value}
        checked={inGroup ? group.value === String(value) : checked}
        disabled={isDisabled}
        aria-invalid={${hasState('invalid') ? `${stateProp!.prop} === 'invalid' || undefined` : 'undefined'}}
        onChange={(event) => {
          onChange?.(event);
          if (event.target.checked && value !== undefined) group.onValueChange?.(String(value));
        }}
        onClick={(event) => {
          if (readOnly) event.preventDefault();
          onClick?.(event);
        }}
        onKeyDown={(event) => {
          if (readOnly && event.key.startsWith('Arrow')) event.preventDefault();
          onKeyDown?.(event);
        }}
        {...rest}
      />
${body}
    </span>
  );
}
`;
    }
    if (r.kind === 'field') {
      const states = controlStates.filter((o) => stateProp?.options.includes(o));
      return `${head}
import type { ChangeEventHandler, HTMLAttributes, ReactNode } from 'react';

${iconImports}${forwardState && controlName ? `import type { ${controlName}Props } from '../${controlName}/${controlName}';\n` : ''}import styles from './${name}.module.css';

export interface ${name}Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange' | 'defaultChecked'${own.map((x) => ` | '${x}'`).join('')}> {
  /** Figma: the label text (${JSON.stringify(r.copy ?? '')}). */
  label?: ReactNode;
  /** Passed to the radio input. */
  name?: string;
  value?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
${lines.join('\n')}
  /** Figma: State=Disabled. */
  disabled?: boolean;
}

export function ${name}({ ${[...axisProps, 'disabled = false', ...extraProps, 'label', 'name', 'value', 'checked', 'defaultChecked', 'onChange', 'className', '...rest'].join(', ')} }: ${name}Props) {
  const control = { name, value, checked, defaultChecked, onChange, disabled${forwardState && controlName ? `, state: (${JSON.stringify(states)} as string[]).includes(${stateProp!.prop}) ? (${stateProp!.prop} as ${controlName}Props['state']) : undefined` : ''} };
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} ${[...dataOfAxes, "data-disabled={disabled ? '' : undefined}"].join(' ')} {...rest}>
${body}
    </div>
  );
}
`;
    }
    // group
    return `${head}
import { useId, useState, type HTMLAttributes, type ReactNode } from 'react';

${iconImports}${r.control ? `import { ${r.control}Context } from '../${r.control}/${r.control}';\n` : ''}import styles from './${name}.module.css';

export interface ${name}Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'defaultValue' | 'onChange'${own.map((x) => ` | '${x}'`).join('')}> {
  /** Figma: the group label (${JSON.stringify(r.copy ?? '')}). Names the radiogroup. */
  label?: ReactNode;
  /** Shared name for the radios inside. Default: a generated id. */
  name?: string;
  /** Selected value (controlled). */
  value?: string;
  /** Initially selected value (uncontrolled). */
  defaultValue?: string;
  /** Called with the value of the radio the user selects. */
  onValueChange?: (value: string) => void;
  /** Disables every radio inside. */
  disabled?: boolean;
  /** The radios. Default: the Figma example items. */
  children?: ReactNode;
${lines.join('\n')}
}

export function ${name}({ ${[...axisProps, 'disabled = false', ...extraProps, 'label', 'name', 'value', 'defaultValue', 'onValueChange', 'children', 'className', '...rest'].join(', ')} }: ${name}Props) {
  const id = useId();
  const labelId = \`\${id}-label\`;
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner ?? '';
  const content = (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
${hasState('invalid') ? `      aria-invalid={${stateProp!.prop} === 'invalid' || undefined}\n` : ''}${hasState('read-only') ? `      aria-readonly={${stateProp!.prop} === 'read-only' || undefined}\n` : ''}      aria-disabled={disabled || undefined}
      className={[styles.root, className].filter(Boolean).join(' ')}
      ${dataOfAxes.join('\n      ')}
      {...rest}
    >
${body}${itemsLayer ? '' : `\n      {children}`}
    </div>
  );
${r.control ? `  return (
    <${r.control}Context.Provider
      value={{
        name: name ?? id,
        value: current,
        onValueChange: (next) => {
          if (value === undefined) setInner(next);
          onValueChange?.(next);
        },
        disabled,
${hasState('read-only') ? `        readOnly: ${stateProp!.prop} === 'read-only',\n` : ''}      }}
    >
      {content}
    </${r.control}Context.Provider>
  );` : '  return content;'}
}
`;
  }

  const css = `/* Generated by ds-sync (generic template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand. */
.root { box-sizing: border-box; position: relative; }
${all.map((l) => `.${l.role}`).join(', ')}${all.length ? ' { box-sizing: border-box; position: relative; margin: 0; min-width: 0; }' : ''}
${sw ? `
/* Native button reset (zero specificity, so the Figma styles below win). */
:where(.root) { appearance: none; border: 0; padding: 0; margin: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; }
.root:disabled, .root[aria-busy="true"] { cursor: not-allowed; }
${figmaFocus ? '' : `.root:focus-visible, .root[data-force-state~="focus"] { outline: 2px solid ${sw.focusColor}; outline-offset: 2px; }\n`}` : ''}${radio?.kind === 'control' ? `
/* Native radio input over the Figma visuals: it takes the clicks, the focus and the checked state. */
.input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; z-index: 1; }
.input:disabled { cursor: not-allowed; }
` : ''}${dialog ? `
/* Native <dialog>: reset the browser styles; the Figma styles below size and paint it. Closed dialogs are hidden. */
:where(.root) { position: static; inset: auto; margin: 0; padding: 0; border: 0; color: inherit; max-width: none; max-height: none; overflow: visible; }
.root:not([open]) { display: none; }
.root:modal { position: fixed; inset: 0; margin: auto; max-width: calc(100% - 32px); max-height: calc(100% - 32px); overflow: auto; }
.root::backdrop { background: ${dialog.backdrop}; }
${typeAxis?.options.includes('side-drawer') ? `.root:modal[data-${typeAxis.attr}="side-drawer"] { margin: 0 0 0 auto; height: 100%; max-height: none; }\n` : ''}${typeAxis?.options.includes('full-screen') ? `.root:modal[data-${typeAxis.attr}="full-screen"] { margin: 0; width: 100%; height: 100%; max-width: none; max-height: none; }\n` : ''}${dialog.close ? `:where(.${dialog.close}) { appearance: none; border: 0; padding: 0; margin: 0; background: none; color: inherit; cursor: pointer; }\n` : ''}` : ''}${input ? `
/* Native input in place of the Figma text layer: reset, then the Figma text styles below apply. */
:where(.${input.value}) { appearance: none; border: 0; margin: 0; padding: 0; background: none; outline: none; font: inherit; min-width: 0; flex: 1 1 auto; width: auto; }
.root .${input.value}:not(:placeholder-shown) { color: ${input.valueColor}; }
.${input.value}::placeholder { color: inherit; opacity: 1; }
.${input.value}:disabled { cursor: not-allowed; }
${input.clear ? `:where(.${input.clear}) { appearance: none; border: 0; padding: 0; margin: 0; background: none; color: inherit; cursor: pointer; }\n` : ''}` : ''}${radio?.kind === 'field' && labelLayer ? `
.root:not([data-disabled]) label { cursor: pointer; }
` : ''}
${styles.css}`;

  // Stories
  const multi = axes.filter((a) => a.values.length > 1);
  const stateAxis = multi.find((a) => a.kind === 'state');
  const rowAxis = multi.find((a) => a !== stateAxis);
  const colAxis = stateAxis ?? multi.find((a) => a !== rowAxis);
  const storyNames = new Set(['Default']);
  const storyName = (s: string) => {
    let n = pascal(s) || 'Axis';
    if (/^[0-9]/.test(n)) n = `S${n}`;
    for (let i = 2; storyNames.has(n); i++) n = `${pascal(s)}${i}`;
    storyNames.add(n);
    return n;
  };
  const cellProps = (a: AxisInfo, figma: string) => (a === sw?.axis ? `{ checked: ${a.values.find((v) => v.figma === figma)?.value === sw.on} }`
    : a === radio?.axis ? (a.values.find((v) => v.figma === figma)?.value === radio.on ? '{ defaultChecked: true }' : '{}')
    : variantObject(a, figma));
  const table = (a: AxisInfo) => `{ ${a.values.map((v) => `${q(v.figma)}: ${cellProps(a, v.figma)}`).join(', ')} }`;
  const defaultDoc = `/** Figma default variant: ${Object.entries(defaults).map(([k, v]) => `${k}=${v}`).join(', ') || 'single variant'}. */`;
  const stories: string[] = [sw ? `${defaultDoc}
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const control = within(canvasElement).getByRole('switch', { name: ${q(sw.label)} });
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);
    // WAI-ARIA switch: Space toggles (Enter too, from the native button).
    control.focus();
    await userEvent.keyboard(' ');
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(false);
  },
};` : radio ? radioDefault() : input ? inputDefault() : dialog ? dialogDefault() : `${defaultDoc}\nexport const Default: Story = {};`];
  function dialogDefault(): string {
    const d = dialog!;
    const titleText = String(texts.find((t) => t.p.name === dTitle?.t.p.name)?.p.default ?? '');
    return `/** A modal dialog opened from a button. Escape closes it and focus returns to the button. */
export const Default: Story = {
  args: { open: undefined, modal: true },
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
        <${name}
          {...args}
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            args.onOpenChange?.(next);
          }}
        />
      </>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Open dialog' });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole('dialog'${d.title ? `, { name: ${q(titleText)} }` : ''});
    await expect(dialog).toHaveAttribute('open');
    await expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    await expect(dialog).not.toHaveAttribute('open');
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    await expect(trigger).toHaveFocus();
  },
};${d.close ? `

/** The close button closes it. */
export const CloseButton: Story = {
  args: { open: undefined, defaultOpen: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dialog = canvas.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await expect(dialog).not.toHaveAttribute('open');
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};` : ''}${d.alertValue ? `

/** Figma Type=Alert is an alertdialog. */
export const AlertRole: Story = {
  args: { ${d.typeProp}: '${d.alertValue}' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alertdialog')).toBeInTheDocument();
  },
};` : ''}`;
  }
  function inputDefault(): string {
    const ip = input!;
    const labelText = String(texts.find((t) => t.prop === ip.props.label)?.p.default ?? '');
    const errorValue = stateProp?.options.find((o) => /^(error|invalid)$/.test(o));
    return `${defaultDoc}
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const field = ${ip.label ? `canvas.getByLabelText(${q(labelText)}${ip.props.required ? ', { exact: false }' : ''})` : "canvas.getByRole('textbox')"};
    await userEvent.type(field, 'Hello');
    await expect(field).toHaveValue('Hello');
    await expect(args.onChange).toHaveBeenCalled();${ip.helper ? `
    await expect(field).toHaveAccessibleDescription(${q(String(texts.find((t) => t.prop === ip.props.helper)?.p.default ?? ''))});` : ''}
  },
};${errorValue ? `

/** Figma State=${stateProp!.values.find((v) => v.value === errorValue)?.figma}: the input is marked invalid. */
export const Invalid: Story = {
  args: { ${stateProp!.prop}: ${q(errorValue)} },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  },
};` : ''}${ip.clear ? `

/** The clear button empties the input and keeps focus in it. */
export const Clear: Story = {
  args: { ${booleans.find((b) => /clear/i.test(b.p.name))!.prop}: true, defaultValue: 'Hello' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }));
    await expect(canvas.getByRole('textbox')).toHaveValue('');
    await expect(canvas.getByRole('textbox')).toHaveFocus();
  },
};` : ''}`;
  }
  function radioDefault(): string {
    const r = radio!;
    if (r.kind === 'control') return `${defaultDoc}
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const radio = within(canvasElement).getByRole('radio', { name: ${q(r.label)} });
    await expect(radio).not.toBeChecked();
    await userEvent.click(radio);
    await expect(radio).toBeChecked();
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};${hasDisabled ? `

/** Disabled: cannot be selected. */
export const DisabledDoesNotSelect: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const radio = within(canvasElement).getByRole('radio', { name: ${q(r.label)} });
    await expect(radio).toBeDisabled();
    await userEvent.click(radio, { pointerEventsCheck: 0 });
    await expect(radio).not.toBeChecked();
  },
};` : ''}`;
    if (r.kind === 'field') return `${defaultDoc}
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // The text is the radio's <label>: clicking it selects the radio.
    await userEvent.click(canvas.getByText(${q(r.copy ?? '')}));
    await expect(canvas.getByRole('radio', { name: ${q(r.copy ?? '')} })).toBeChecked();
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};`;
    return `${defaultDoc}
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radiogroup', { name: ${q(r.copy ?? '')} })).toBeInTheDocument();
    const radios = canvas.getAllByRole('radio');
    await userEvent.click(radios[0]!);
    await expect(radios[0]).toBeChecked();
    // WAI-ARIA radio group: arrow keys move focus and selection.
    await userEvent.keyboard('{ArrowDown}');
    await expect(radios[1]).toBeChecked();
    await expect(radios[1]).toHaveFocus();
    await expect(radios[0]).not.toBeChecked();
  },
};`;
  }
  // Every Figma variant once, at its Figma width: the reference for "ds-sync visual" (and a quick look for designers).
  const variantCell = (v: IRVariant): string => {
    const out: string[] = [];
    const force: string[] = [];
    for (const a of axes) {
      const val = a.values.find((x) => x.figma === v.values[a.figma]);
      if (!val) continue;
      if (a === sw?.axis) out.push(`checked: ${val.value === sw.on}`);
      else if (a === radio?.axis) { if (val.value === radio.on) out.push('defaultChecked: true'); }
      else if (val.role === 'pseudo') force.push(val.state!);
      else if (val.role === 'disabled') out.push('disabled: true');
      else if (a.options.length > 1) out.push(`${a.prop}: ${axisLiteral(a, val.value, q)}`);
    }
    if (force.length) out.push(`'data-force-state': ${q(force.join(' '))}`);
    return `{ ${out.join(', ')} }`;
  };
  const visual: VisualVariant[] = set.variants.map((v) => ({ nodeId: v.nodeId, name: v.name, width: Math.round(v.style.width ?? 0), height: Math.round(v.style.height ?? 0), ...(v.style.paintBox ? { paintBox: v.style.paintBox } : {}) }));
  const figmaVariantsStory = `/** Every Figma variant once, at its Figma width. Used by "ds-sync visual" to compare with Figma's own renders. */
export const FigmaVariants: Story = {
  tags: ['!test', '!autodocs'],
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 }}>
      {[
${set.variants.map((v) => `        { id: ${q(v.nodeId)}, name: ${q(v.name)}, width: ${Math.round(v.style.width ?? 0)}, props: ${variantCell(v)} as Partial<${name}Props> },`).join('\n')}
      ].map((v) => (
        <div key={v.id} data-figma-variant={v.id} title={v.name} style={{ display: 'flex', width: v.width }}>
          <${name} {...args} {...v.props} />
        </div>
      ))}
    </div>
  ),
};`;
  if (sw && hasDisabled) {
    stories.push(`/** Disabled: not focusable and does not toggle. */
export const DisabledDoesNotToggle: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const control = within(canvasElement).getByRole('switch', { name: ${q(sw.label)} });
    await expect(control).toBeDisabled();
    await userEvent.click(control, { pointerEventsCheck: 0 });
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};`);
  }
  if (sw?.busy) {
    stories.push(`/** Loading: aria-busy, and clicks do not toggle. */
export const LoadingDoesNotToggle: Story = {
  args: { ${sw.busy.prop}: 'loading' },
  play: async ({ canvasElement, args }) => {
    const control = within(canvasElement).getByRole('switch', { name: ${q(sw.label)} });
    await expect(control).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};`);
  }
  const sections: { heading: string; story: string }[] = [];
  const consumed = new Set<AxisInfo>();
  if (rowAxis && colAxis) {
    const n = storyName(`${rowAxis.figma} And ${colAxis.figma}`);
    consumed.add(rowAxis).add(colAxis);
    stories.push(`/** Figma ${rowAxis.figma} × ${colAxis.figma}. Pseudo states are forced with data-force-state. */
export const ${n}: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => {
    const rows: Record<string, Partial<${name}Props>> = ${table(rowAxis)};
    const columns: Record<string, Partial<${name}Props>> = ${table(colAxis)};
    return (
      <Matrix
        label="${rowAxis.figma} by ${colAxis.figma}"
        rows={Object.keys(rows)}
        columns={Object.keys(columns)}
        cell={(row, column) => <${name} {...args} {...rows[row]} {...columns[column]} />}
      />
    );
  },
};`);
    sections.push({ heading: `${rowAxis.figma} and ${colAxis.figma}`, story: n });
  }
  for (const a of multi.filter((x) => !consumed.has(x))) {
    const n = storyName(a.figma);
    stories.push(`/** Figma ${a.figma}. */
export const ${n}: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => {
    const values: Record<string, Partial<${name}Props>> = ${table(a)};
    return (
      <Row>
        {Object.entries(values).map(([label, props]) => (
          <Labelled key={label} label={label}><${name} {...args} {...props} /></Labelled>
        ))}
      </Row>
    );
  },
};`);
    sections.push({ heading: a.figma, story: n });
  }
  if (booleans.length) {
    const n = storyName('Options');
    stories.push(`/** Figma boolean properties, each switched from its default. */
export const ${n}: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Row>
      <Labelled label="Default"><${name} {...args} /></Labelled>
${booleans.map((b) => `      <Labelled label=${q(`${b.p.name}: ${String(b.p.default) === 'true' ? 'off' : 'on'}`)}><${name} {...args} ${b.prop}={${String(b.p.default) !== 'true'}} /></Labelled>`).join('\n')}
    </Row>
  ),
};`);
    sections.push({ heading: 'Options', story: n });
  }

  const argTypes = [
    ...(sw ? [`    checked: { control: 'boolean', description: ${q(`On or off (controlled). Figma: ${sw.axis.figma}`)} },`, `    defaultChecked: { control: 'boolean' },`] : []),
    ...propAxes.map((a) => `    ${a.prop}: ${axisControl(a, q)},`),
    ...(hasDisabled ? [`    disabled: { control: 'boolean', description: 'Figma: State=Disabled' },`] : []),
    ...booleans.map((b) => `    ${b.prop}: { control: 'boolean', description: ${q(`Figma: ${b.p.name}`)} },`),
    ...texts.map((t) => `    ${t.prop}: { control: 'text', description: ${q(`Figma: ${t.p.name}`)} },`),
    `    'data-force-state': { table: { disable: true } },`,
  ];
  stories.push(figmaVariantsStory);
  const storiesFile = `// Generated by ds-sync (${sw ? 'switch' : radio ? 'radio' : input ? 'input' : dialog ? 'dialog' : 'generic'} template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
import type { Meta, StoryObj } from '@storybook/react-vite';
${dialog ? "import { useState } from 'react';\nimport { expect, fn, userEvent, within } from 'storybook/test';\n" : ''}${sw || radio?.kind === 'control' || radio?.kind === 'field' || input ? "import { expect, fn, userEvent, within } from 'storybook/test';\n" : radio ? "import { expect, userEvent, within } from 'storybook/test';\n" : ''}
import { Labelled, Matrix, Row } from '../../storybook/layout';
import { ${name}, type ${name}Props } from './${name}';

const meta = {
  title: ${q(opts.title)},
  component: ${name},
${sw ? `  args: { 'aria-label': ${q(sw.label)}, onCheckedChange: fn() },\n` : radio?.kind === 'control' ? `  args: { 'aria-label': ${q(radio.label)}, onChange: fn() },\n` : radio?.kind === 'field' || input ? '  args: { onChange: fn() },\n' : dialog ? '  // Variant stories show open, non-modal dialogs in the page.\n  args: { open: true, modal: false, onOpenChange: fn() },\n' : ''}  argTypes: {
${argTypes.join('\n')}
  },
  parameters: { figma: { fileKey: ${q(ctx.fileKey)}, nodeId: ${q(set.nodeId)} }, generator: ${q(sw ? 'switch' : radio ? 'radio' : input ? 'input' : dialog ? 'dialog' : 'generic')} },
} satisfies Meta<typeof ${name}>;

export default meta;
type Story = StoryObj<typeof meta>;

// Keep the type import used even when no lookup tables are generated.
export type { ${name}Props };

${stories.join('\n\n')}
`.replace(/import \{ Labelled, Matrix, Row \} from '..\/..\/storybook\/layout';\n/, (m) => {
    const used = ['Labelled', 'Matrix', 'Row'].filter((x) => stories.some((s) => s.includes(`<${x}`)));
    return used.length ? `import { ${used.join(', ')} } from '../../storybook/layout';\n` : '';
  });

  const mapping: ComponentReport['props'] = [
    ...(dialog ? [{ prop: 'open / defaultOpen / modal / onOpenChange', figma: '—', note: 'Native <dialog>: showModal() when modal.' }, ...(dialog.body ? [{ prop: 'children', figma: `${dBody!.part.name} (layer)`, note: 'Default: the Figma body.' }] : []), ...(dialog.footer ? [{ prop: 'footer', figma: `${dFooter!.part.name} (layer)`, note: 'Default: the Figma buttons, without actions.' }] : [])] : []),
    ...(input ? [{ prop: 'value / defaultValue / onChange / type / name / maxLength / ...', figma: `${ph!.l!.part.name} (text layer)`, note: 'Native input attributes; the Figma placeholder text is the placeholder.' }, { prop: 'invalid', figma: '—', note: 'aria-invalid without changing the look.' }] : []),
    ...(radio?.kind === 'field' ? [{ prop: 'label', figma: `${labelLayer?.part.name ?? 'text'} (text layer)`, note: 'Rendered in the <label>.' }, { prop: 'name / value / checked / defaultChecked / onChange', figma: '—', note: 'Passed to the radio input.' }] : []),
    ...(radio?.kind === 'group' ? [{ prop: 'label', figma: `${groupLabelLayer?.part.name ?? 'text'} (text layer)`, note: 'Names the radiogroup.' }, { prop: 'name / value / defaultValue / onValueChange', figma: '—', note: 'Shared by the radios inside.' }, { prop: 'children', figma: `${itemsLayer?.part.name ?? 'items'} (layer)`, note: 'Default: the Figma example items.' }] : []),
    ...axes.map((a) => a === radio?.axis
      ? { prop: 'checked / defaultChecked', figma: `${a.figma} (variant)`, note: `${a.values.map((v) => `${v.figma} → ${v.value === radio.on ? 'checked' : 'not checked'}`).join(', ')}; styled with :checked.` }
      : a === sw?.axis
      ? { prop: 'checked / defaultChecked', figma: `${a.figma} (variant)`, note: `${a.values.map((v) => `${v.figma} → ${v.value === sw.on ? 'checked' : 'not checked'}`).join(', ')}; aria-checked.` }
      : ({ prop: a.options.length > 1 ? a.prop : '—', figma: `${a.figma} (variant)`, note: a.kind === 'state' ? `States: ${a.values.map((v) => `${v.figma} → ${v.role === 'pseudo' ? `:${v.state} (CSS)` : v.role === 'disabled' ? 'disabled' : v.role === 'base' ? 'default' : `${a.prop}="${v.value}"`}`).join(', ')}` : undefined })).map((m) => (m.note ? m : { prop: m.prop, figma: m.figma })),
    ...booleans.map((b) => ({ prop: b.prop, figma: `${b.p.name} (boolean)` })),
    ...texts.map((t) => ({ prop: t.prop, figma: `${t.p.name} (text)` })),
    ...swaps.map((s) => ({ prop: '—', figma: `${s.name} (instance swap)`, note: 'Not exposed yet.' })),
  ];
  const uniqueGaps = [...new Set(gaps)];
  const core: GenericCore = { set, css, layers: all, axes, booleans, texts, hasDisabled, defaults, assumptions, gaps: uniqueGaps, mapping, title: opts.title, description: set.description, rowAxis, colAxis, multi, consumed: [...consumed], ...(sw ? { behavior: sw } : {}), ...(input ? { input } : {}), ...(dialog ? { dialog } : {}), visual, ...(radio ? { radio, radioLayers: { ...(controlLayer ? { control: controlLayer.role } : {}), ...(rowPath !== undefined ? { row: byPath.get(rowPath)?.role ?? 'root' } : {}), ...(labelLayer ? { label: labelLayer.role } : {}), ...(itemsLayer ? { items: itemsLayer.role } : {}), ...(groupLabelLayer ? { groupLabel: groupLabelLayer.role } : {}), ...(controlName ? { controlComponent: controlName } : {}), ...(itemsLayer ? (() => { const f = all.find((c) => c.parent === itemsLayer.path && kindOf(c) === 'radio-field'); const n = f ? opts.instance(f.part)?.component : undefined; return n ? { fieldComponent: n } : {}; })() : {}), ...(forwardState ? { forwardStates: controlStates.filter((o) => stateProp?.options.includes(o)) } : {}) } } : {}) };
  const files = [
    { path: `${dir}/${name}.tsx`, content: tsx },
    { path: `${dir}/${name}.module.css`, content: css },
    { path: `${dir}/${name}.stories.tsx`, content: storiesFile },
    { path: `${dir}/${name}.mdx`, content: mdxPage(name, name, sections) },
    { path: `${dir}/${name}.figma.json`, content: docsJson(ctx, [set], name, set.description, mapping, [...assumptions, ...uniqueGaps]) },
  ];
  return {
    files,
    report: { name, figmaSets: [`${set.name} (${set.nodeId})`], files: files.map((f) => f.path), props: mapping, assumptions, gaps: uniqueGaps, dependencies: styles.dependencies },
    core,
  };
}
