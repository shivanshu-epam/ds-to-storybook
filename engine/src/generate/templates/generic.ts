/**
 * Generic template: renders ANY Figma component set from its layer tree.
 *
 * - Variant axes become enum props (data attributes). Axes with Hover/Pressed/Focused values
 *   become CSS pseudo states (forceable for stories); "Disabled" becomes a boolean prop.
 * - Boolean properties toggle the layers bound to them; text properties fill bound text layers.
 * - Icons are the exported Figma SVGs; instances of other generated components render those components.
 * - Behaviour (keyboard, focus, ARIA roles) is NOT inferred: the report and docs say so.
 */
import { codeAxis, codeBoolean } from '../../code/map.ts';
import { decidedComponent, decidedDescription, decidedInternal, decidedName, decidedValue } from '../../decisions/decisions.ts';
import type { IRComponentSet, IRPart, IRProperty, IRVariant } from '../../ir/types.ts';
import { JS_RESERVED } from '../../util/reserved.ts';
import { generateStyles, type Found, type RoleDef, type StateAxis, type StyleModel, type VariantAxis } from '../styles.ts';
import type { IconAsset } from '../icons.ts';
import { docsJson, forced, kebab, mdxPage, pascal, q, type ComponentReport, type TemplateContext, type TemplateResult } from './common.ts';

const PSEUDO: { test: RegExp; state: string; native: string }[] = [
  { test: /^(hover|hovered)$/i, state: 'hover', native: ':hover' },
  { test: /^(pressed|active)$/i, state: 'pressed', native: ':active' },
  { test: /^(focus|focused|focus-visible)$/i, state: 'focus', native: ':focus-visible' },
];
const RESERVED = new Set(['children', 'className', 'style', 'key', 'ref', 'id', ...JS_RESERVED]);
/** "<decided description> Figma: <name>", or "Figma: <name>" when there is no decision. */
export const figmaNote = (figma: string, description?: string) => (description ? `${description.replace(/\s*$/, '')} Figma: ${figma}` : `Figma: ${figma}`);

export const camel = (s: string) => {
  const c = pascal(s);
  return c.charAt(0).toLowerCase() + c.slice(1);
};

export interface AxisValue {
  figma: string;
  value: string;
  role: 'base' | 'pseudo' | 'disabled' | 'enum';
  state?: string;
  /** A separate component in code (a decision): not part of the prop's public type. */
  component?: string;
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
  /** Plain-language description from an applied decision (ds-sync.decisions.json). */
  description?: string;
}

/** How an axis appears in code: True/False axes are booleans, the rest string unions. quote() quotes a string. */
/** Values a separate component renders (a decision) are not part of the prop's public type or control. */
const publicOptions = (a: AxisInfo) => a.options.filter((o) => !a.values.some((v) => v.component && v.value === o));
export const axisType = (a: AxisInfo, quote: (s: string) => string) => (a.boolean ? 'boolean' : publicOptions(a).map(quote).join(' | '));
export const axisDefault = (a: AxisInfo, quote: (s: string) => string) => (a.boolean ? String(a.defaultValue === 'true') : quote(a.defaultValue));
export const axisLiteral = (a: AxisInfo, value: string, quote: (s: string) => string) => (a.boolean ? String(value === 'true') : quote(value));
/** data-* attribute value from a code reference: booleans render as "true" / "false", as the CSS expects. */
export const axisData = (a: AxisInfo, ref: string) => (a.boolean ? `${ref} ? 'true' : 'false'` : ref);
/** Storybook control for an axis. */
export const axisControl = (a: AxisInfo, quote: (s: string) => string) =>
  a.boolean ? `{ control: 'boolean', description: ${quote(figmaNote(a.figma, a.description))} }` : `{ control: '${publicOptions(a).length > 5 ? 'select' : 'inline-radio'}', options: [${publicOptions(a).map(quote).join(', ')}], description: ${quote(figmaNote(a.figma, a.description))} }`;

export function analyzeAxes(set: IRComponentSet): AxisInfo[] {
  const used = new Set<string>();
  return set.properties
    .filter((p) => p.type === 'VARIANT')
    .map((p) => {
      const opts = p.options ?? [];
      const isBool = opts.length === 2 && opts.every((o) => /^(true|false)$/i.test(o));
      // isDisabled=True/False is the disabled state, like State=Disabled.
      if (isBool && /^(is[ _-]?)?disabled$/i.test(p.name)) {
        let prop = decidedName(set, p.name) ?? camel(p.name);
        if (RESERVED.has(prop) || used.has(prop)) prop = `${prop}Variant`;
        used.add(prop);
        return {
          figma: p.name, prop, attr: kebab(p.name), kind: 'state' as const,
          values: opts.map((o) => (/^true$/i.test(o) ? { figma: o, value: 'disabled', role: 'disabled' as const } : { figma: o, value: 'false', role: 'base' as const })),
          options: ['false'], defaultValue: 'false',
          ...(decidedDescription(set, p.name) ? { description: decidedDescription(set, p.name)! } : {}),
        };
      }
      const isState = !isBool && opts.some((o) => PSEUDO.some((x) => x.test.test(o)) || /^disabled$/i.test(o));
      // Code mode: the code prop and value names (code wins for the API); values code lacks keep Figma's name.
      const code = isState ? undefined : codeAxis(set, p.name);
      const val = (o: string) => decidedValue(set, p.name, o) ?? code?.value(o) ?? kebab(o);
      const values: AxisValue[] = opts.map((o) => {
        const pseudo = PSEUDO.find((x) => x.test.test(o));
        if (isState && o === String(p.default)) return { figma: o, value: kebab(o), role: 'base' };
        if (isState && pseudo) return { figma: o, value: kebab(o), role: 'pseudo', state: pseudo.state };
        if (isState && /^disabled$/i.test(o)) return { figma: o, value: 'disabled', role: 'disabled' };
        const component = decidedComponent(set, p.name, o);
        return { figma: o, value: val(o), role: 'enum', ...(component ? { component } : {}) };
      });
      let prop = decidedName(set, p.name) ?? code?.prop ?? camel(p.name);
      if (RESERVED.has(prop) || used.has(prop)) prop = `${prop}Variant`;
      used.add(prop);
      return {
        figma: p.name,
        prop,
        attr: kebab(p.name),
        kind: isState ? ('state' as const) : ('variant' as const),
        values,
        options: values.filter((v) => v.role === 'base' || v.role === 'enum').map((v) => v.value),
        defaultValue: isState ? kebab(String(p.default)) : val(String(p.default)),
        ...(isBool || code?.boolean ? { boolean: true } : {}),
        ...(decidedDescription(set, p.name) ? { description: decidedDescription(set, p.name)! } : {}),
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
  return a.options.length > 1 ? `{ ${a.prop}: ${axisLiteral(a, v.value, q)}${v.component ? ' as never' : ''} }` : '{}';
}

export interface PropPlan {
  axes: AxisInfo[];
  booleans: { p: IRProperty; prop: string; description?: string }[];
  texts: { p: IRProperty; prop: string; description?: string }[];
  swaps: IRProperty[];
  hasDisabled: boolean;
  /** Visibility toggles that belong to one content slot: a boolean that shows the frame holding the only instance
   * an instance swap is bound to. Where the template makes slots, the slot prop replaces the boolean (React). */
  toggles: SlotToggle[];
}

export interface SlotToggle {
  /** Figma boolean property. */
  bool: string;
  /** Figma instance-swap property it shows. */
  swap: string;
  /** The slot's code prop. */
  slotProp: string;
  /** Layer name of the swap-bound instance (to read an instance's icon from). */
  layer: string;
  /** Icon the slot shows by default, when it is an icon. */
  icon?: string;
  /** Size of the swap-bound instance in Figma: an icon passed into the slot gets this box (icons fill their parent). */
  size?: [number, number];
  default: boolean;
}

/** An icon as slot content, in a box of the size Figma gives the slot (React). */
export const sizedIcon = (name: string, size?: [number, number]) => (size ? `<span style={{ display: 'flex', width: ${size[0]}, height: ${size[1]} }}><Icon name="${name}" /></span>` : `<Icon name="${name}" />`);

/** Behaviour templates whose generated component has content slots (and so takes toggles as slot props). */
export const SLOT_TEMPLATES = new Set(['generic', 'switch', 'checkbox-single', 'disclosure', 'button', 'link', 'combobox']);
const SLOT_RESERVED = ['disabled', 'checked', 'className', 'style', 'children', ...JS_RESERVED];

/** Toggle-and-swap pairs, from structure only: the boolean is bound to the visibility of one layer, that layer holds
 * the one instance bound to the swap (and no text or other toggle), and the swap is bound nowhere else. */
export function slotToggles(set: IRComponentSet, taken: Set<string>): SlotToggle[] {
  const dv = defaultVariantOf(set);
  if (!dv) return [];
  const swapNames = new Set(set.properties.filter((p) => p.type === 'INSTANCE_SWAP').map((p) => p.name));
  const out: SlotToggle[] = [];
  const used = new Set(taken);
  for (const b of set.properties.filter((p) => p.type === 'BOOLEAN')) {
    const holders = dv.parts.filter((x) => x.refs?.visible === b.name);
    if (holders.length !== 1) continue;
    const h = holders[0]!;
    const inside = dv.parts.filter((x) => x.path === h.path || x.path.startsWith(`${h.path}/`));
    if (inside.some((x) => x.refs?.characters || (x !== h && x.refs?.visible))) continue;
    const bound = inside.filter((x) => x.type === 'INSTANCE' && x.refs?.mainComponent && swapNames.has(x.refs.mainComponent));
    const swap = bound[0]?.refs?.mainComponent;
    if (!swap || bound.length !== 1 || out.some((t) => t.swap === swap)) continue;
    if (dv.parts.some((x) => x.refs?.mainComponent === swap && !inside.includes(x))) continue;
    let slotProp = decidedName(set, swap) ?? camel(swap.replace(/[^A-Za-z0-9 _-]+/g, ' ').trim());
    if (!slotProp) continue;
    if (used.has(slotProp)) slotProp = `${slotProp}Slot`;
    used.add(slotProp);
    const w = bound[0]!.style.width, hgt = bound[0]!.style.height;
    out.push({ bool: b.name, swap, slotProp, layer: bound[0]!.name, ...(bound[0]!.icon && bound[0]!.instanceOf ? { icon: bound[0]!.instanceOf } : {}), ...(w && hgt ? { size: [Math.round(w), Math.round(hgt)] as [number, number] } : {}), default: String(b.default) === 'true' });
  }
  return out;
}

/** Prop names for a set (shared by the component and by places that render it as a nested instance). */
export function propPlan(set: IRComponentSet): PropPlan {
  const axes = analyzeAxes(set);
  const used = new Set(axes.map((a) => a.prop));
  const name = (p: IRProperty) => {
    let n = decidedName(set, p.name) ?? (p.type === 'BOOLEAN' ? codeBoolean(set, p.name) : undefined) ?? camel(p.name);
    if (RESERVED.has(n) || used.has(n)) n = `${n}${p.type === 'TEXT' ? 'Text' : 'Prop'}`;
    used.add(n);
    return n;
  };
  const booleans = set.properties.filter((p) => p.type === 'BOOLEAN').map((p) => ({ p, prop: name(p), ...(decidedDescription(set, p.name) ? { description: decidedDescription(set, p.name)! } : {}) }));
  const texts = set.properties.filter((p) => p.type === 'TEXT').map((p) => ({ p, prop: name(p), ...(decidedDescription(set, p.name) ? { description: decidedDescription(set, p.name)! } : {}) }));
  return {
    axes, booleans, texts,
    swaps: set.properties.filter((p) => p.type === 'INSTANCE_SWAP'),
    hasDisabled: axes.some((a) => a.values.some((v) => v.role === 'disabled')),
    toggles: slotToggles(set, new Set([...axes.map((a) => a.prop), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop), ...SLOT_RESERVED])),
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
  /** WAI-ARIA role: a switch, a checkbox (recognised from a checked axis), or a radio (a checked axis on a set named as one). */
  role: 'switch' | 'checkbox' | 'radio';
  /** Checkbox only: a True/False axis for the mixed state (indeterminate), which sets aria-checked="mixed". */
  mixed?: AxisInfo;
  /** The component has its own label text (a Figma text property): that text is its accessible name, not aria-label. */
  labelled?: boolean;
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

export type Behavior = 'switch' | 'checkbox-single' | 'radio-single' | 'disclosure' | 'button' | 'link' | 'radio' | 'radio-field' | 'radio-group' | 'input' | 'dialog' | 'combobox';

/** Combobox pack: the axis whose value shows the popup, the field that becomes the combobox, the popup and its label. */
export interface Combo {
  axis: AxisInfo;
  /** Axis value when open, and the one used when closed. */
  open: string;
  closed: string;
  field: string;
  popup: string;
  label?: string;
  /** Boolean prop that shows the label layer, when one does. */
  labelShown?: string;
  /** Accessible name when no label is shown. */
  defaultLabel: string;
  /** combobox: the popup holds selectable options (listbox). menu-button: it holds actions (menu). */
  kind: 'combobox' | 'menu-button';
}

export function switchAxis(axes: AxisInfo[]): { axis: AxisInfo; on: string; off: string } | undefined {
  // Prefer an axis named for the on/off state; never one that names another state (expanded, loading, error, mixed).
  const other = /expand|open|load|error|indeterm|intermed|mixed|full|only|disabled/i;
  const named = /check|select|value|toggle|^(is[ _-]?)?on$|active/i;
  const ordered = [...axes.filter((a) => named.test(a.figma)), ...axes.filter((a) => !named.test(a.figma) && !other.test(a.figma))];
  for (const a of ordered) {
    if (a.kind !== 'variant' || a.values.length !== 2) continue;
    const vals = a.values.map((v) => v.value);
    for (const [off, on] of ON_OFF) if (vals.includes(off) && vals.includes(on)) return { axis: a, on, off };
  }
  return undefined;
}

export type NestedCheck = NonNullable<ComponentReport['nested']>;

/** Disclosure pack (phase 3): the expanded axis, and the header and panel layers found from structure. */
export interface DisclosureLayers {
  axis: AxisInfo;
  /** Layer path of the header (becomes the toggle button) and of the panel (shown only when expanded). */
  header: string;
  panel: string;
}

/**
 * Recognises a disclosure from structure, not names: a True/False variant axis about being expanded or open, one layer
 * visible in every expanded variant and hidden or absent in every collapsed one (the panel), and one sibling frame
 * visible in all variants (the header). Single wrapper frames around them are looked through.
 */
export function disclosureLayers(set: IRComponentSet, axes: AxisInfo[]): DisclosureLayers | undefined {
  const axis = axes.find((a) => a.boolean && a.kind === 'variant' && /expand|open/i.test(a.figma));
  if (!axis) return undefined;
  const onFigma = axis.values.find((v) => v.value === 'true')?.figma;
  const onVs = set.variants.filter((v) => v.values[axis.figma] === onFigma);
  const offVs = set.variants.filter((v) => v.values[axis.figma] !== onFigma);
  if (!onVs.length || !offVs.length) return undefined;
  const visible = (v: IRVariant, path: string) => v.parts.some((x) => x.path === path && !x.hidden);
  const kidsOf = (parent: string) => [...new Set(set.variants.flatMap((v) => v.parts.filter((x) => x.parent === parent && x.type !== 'TEXT').map((x) => x.path)))];
  let parent = '';
  for (let depth = 0; depth < 3; depth++) {
    const kids = kidsOf(parent);
    const panels = kids.filter((k) => onVs.every((v) => visible(v, k)) && offVs.every((v) => !visible(v, k)));
    const headers = kids.filter((k) => set.variants.every((v) => visible(v, k)) && set.variants.every((v) => { const x = v.parts.find((y) => y.path === k); return x && x.type !== 'INSTANCE' && x.type !== 'TEXT'; }));
    if (panels.length === 1 && headers.length === 1) return { axis, header: headers[0]!, panel: panels[0]! };
    if (kids.length !== 1) return undefined;
    parent = kids[0]!;
  }
  return undefined;
}

export interface GenericCore {
  /** Button or link pack: the native root element, and the axis that sets aria-busy. */
  rootTag?: 'button' | 'a';
  /** Disclosure with a nested trigger button: the boolean prop, the trigger layer and the panel layer. */
  trigger?: { prop: string; trigger: string; panel: string };
  /** Combobox pack (select-only): field, popup and the open axis. */
  combo?: Combo;
  /** Collection pack: group role, item semantics and selection. */
  collection?: Collection;
  /** Repeated children the parent configures: the layer, the prop that replaces Figma's examples, what it sets on each. */
  repeats?: { path: string; prop: string; component: string; driven: DrivenProp[] }[];
  /** Viewport axes (props) that follow the viewport when not set. */
  responsive?: string[];
  busyProp?: string;
  /** Accessible name the stories give a button or link that has no text in Figma. */
  storyLabel?: string;
  /** Text prop that names a button or link whose label layer some variants hide (icon-only): it becomes aria-label. */
  nameFrom?: string;
  /** Disclosure pack: the expanded prop and the header (button) and panel layer roles. */
  disclosure?: { prop: string; header: string; panel: string; headerPath: string; triggerPath?: string };
  /** Content slots (instance swaps and placeholders). */
  slots?: SlotInfo[];
  /** Booleans merged into a slot (React has only the slot prop; Web Components keep the boolean too). */
  toggles?: { b: { p: IRProperty; prop: string; description?: string }; slot: SlotInfo }[];
  set: IRComponentSet;
  css: string;
  layers: LayerInfo[];
  axes: AxisInfo[];
  booleans: { p: IRProperty; prop: string; description?: string }[];
  texts: { p: IRProperty; prop: string; description?: string }[];
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
  /** Props each placed nested instance gets (keyed by the layer's IRPart): constants, lookups and pass-throughs. */
  nestedProps?: Map<IRPart, InstanceProp[]>;
  /** Props taken from exposed nested instances. */
  exposed?: ChildProp[];
  nestedCheck?: NestedCheck;
  /** Layer roles the radio packs render specially. */
  radioLayers?: { control?: string; row?: string; label?: string; items?: string; groupLabel?: string; controlComponent?: string; fieldComponent?: string; forwardStates?: string[] };
}

/** A generated component another component can embed. */
export interface RegistryEntry {
  component: string;
  importPath: string;
  kind: 'action' | 'generic' | 'switch' | 'radio' | 'radio-field' | 'radio-group' | 'input' | 'dialog' | 'disclosure' | 'button' | 'link' | 'combobox';
  set: IRComponentSet;
  /** Discovery template (kind folds some together): decides whether the component has slots. */
  template?: string;
}

/** Toggles a nested component takes as slot props (its template makes slots). */
export function mergedToggles(entry: RegistryEntry): SlotToggle[] {
  return SLOT_TEMPLATES.has(entry.template ?? entry.kind) ? propPlan(entry.set).toggles : [];
}

/** One prop set on a placed instance, independent of the output framework. */
export type InstanceProp =
  /** internal: a value a separate component renders (a decision); set through a cast, it is not in the public type. */
  | { prop: string; kind: 'string'; value: string; internal?: boolean }
  | { prop: string; kind: 'boolean'; value: boolean }
  | { prop: string; kind: 'icon'; value: string }
  /** A slot's visibility toggle set on a placed instance. prop is the boolean (Web Components keep it); React passes
   * the slot content instead: the icon when shown, null when hidden. */
  | { prop: string; kind: 'toggle'; value: boolean; slot: string; icon?: string; size?: [number, number] }
  | { prop: string; kind: 'force-state'; value: string }
  /** A value the parent computes: ref turns a parent prop name into code (React: the variable; Lit: this.prop). */
  | { prop: string; kind: 'expr'; value: string; expr: (ref: (prop: string) => string) => string; from?: string[] };

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
    else if (a.options.length > 1 && v.value !== a.defaultValue) out.push(a.boolean ? { prop: a.prop, kind: 'boolean', value: v.value === 'true' } : { prop: a.prop, kind: 'string', value: v.value, ...(v.component ? { internal: true } : {}) });
  }
  return out;
}

export function reactAttrs(props: InstanceProp[], text?: string): string[] {
  const attrs = props.map((p) =>
    p.kind === 'string' ? (p.internal ? `${p.prop}={${JSON.stringify(p.value)} as never}` : `${p.prop}=${JSON.stringify(p.value)}`)
      : p.kind === 'boolean' ? (p.value ? p.prop : `${p.prop}={false}`)
      : p.kind === 'icon' ? `${p.prop}={<Icon name="${p.value}" />}`
      : p.kind === 'toggle' ? `${p.slot}={${p.value && p.icon ? sizedIcon(p.icon, p.size) : 'null'}}`
      : p.kind === 'expr' ? `${p.prop}={${p.expr((x) => (x === '$checked' ? 'on' : x))}}`
      : `data-force-state="${p.value}"`,
  );
  if (text !== undefined) attrs.push(`children=${JSON.stringify(text)}`);
  return attrs;
}

/**
 * Collection pack (phase 3): a group of repeated items, recognised from what the item is.
 * - items that already behave as radios (radio pack) -> radiogroup, single selection managed by the group;
 * - items that already behave (checkbox, switch) -> group, each item keeps its own state;
 * - items with a selected axis in a set named as tabs -> tablist, single selection, items become tabs;
 * - items with a checked axis but no behaviour (chips) -> group, multiple selection, items become checkboxes.
 */
export interface Collection {
  role: 'group' | 'radiogroup' | 'tablist' | 'listbox' | 'menu';
  item: 'own' | 'own-radio' | 'tab' | 'checkbox' | 'option' | 'menuitem';
  /** Listbox: the axis value that allows several selected options (Selection Type = Multi). None: one. */
  multiple?: { prop: string; value: string };
  /** Items that are not options or menu items (separators, section headings): the item's axis and each Figma copy's kind. */
  kinds?: { prop: string; separator: string[]; heading: string[]; copies: ItemKind[] };
  /** Listbox: each Figma copy's own selected value as code (given how a prop is referenced), kept until the user selects. */
  copySelected?: ((ref: (prop: string) => string) => string)[];
  /** Accessible name when no label layer names the group. */
  defaultLabel?: string;
  /** Listbox and menu: the axis values in which Figma shows no items (loading, empty). The role is dropped there. */
  hiddenWhen?: { prop: string; values: string[] };
  selection: 'none' | 'single' | 'multi';
  /** The item's state prop the group sets (isSelected, isChecked), when items have no behaviour of their own. */
  stateProp?: string;
  repeatPath: string;
  /** Layer whose text names the group (aria-labelledby). */
  labelPath?: string;
  /** Item indexes selected in the Figma default. */
  initial: number[];
  orientation?: AxisInfo;
}

export type ItemKind = 'item' | 'separator' | 'heading';

/** Listbox and menu (WAI-ARIA): one tab stop, arrow keys move the active item (aria-activedescendant). */
const listy = (c?: Collection) => c?.item === 'option' || c?.item === 'menuitem';

/** React body for a listbox or menu: active item, selection (listbox) and keyboard. */
function listBody(c: Collection): string {
  const lines = [
    '  const labelId = useId();',
    '  const [active, setActive] = useState(-1);',
  ];
  // Typed lists: an empty one ("[]") is never[] to TypeScript, and includes(string) would not compile.
  if (c.kinds) lines.push(`  const kindOf = (value: unknown) => ((${JSON.stringify(c.kinds.separator)} as string[]).includes(String(value)) ? 'separator' : (${JSON.stringify(c.kinds.heading)} as string[]).includes(String(value)) ? 'heading' : 'item');`);
  if (c.item === 'option') lines.push(
    "  // Undefined until the user selects: each option keeps the selection Figma gives it.",
    '  const [innerSelected, setInnerSelected] = useState<number[] | undefined>(defaultSelected);',
    '  const selectedIndexes = selected ?? innerSelected;',
    `  const multiple = ${c.multiple ? `${c.multiple.prop} === ${JSON.stringify(c.multiple.value)}` : 'false'};`,
    '  const toggle = (i: number, list: Element | null) => {',
    "    const current = selectedIndexes ?? [...(list?.querySelectorAll<HTMLElement>('[data-ds-item][aria-selected=true]') ?? [])].map((x) => Number(x.dataset.dsIndex));",
    '    const next = current.includes(i) ? (multiple ? current.filter((x) => x !== i) : current) : multiple ? [...current, i].sort((a, b) => a - b) : [i];',
    '    if (selected === undefined) setInnerSelected(next);',
    '    onSelectedChange?.(next);',
    '  };',
    "  const itemProps = (i: number, figmaSelected?: boolean, kind: string = 'item') => {",
    "    if (kind === 'separator') return { 'aria-hidden': true };",
    "    if (kind === 'heading') return { role: 'presentation' };",
    '    const on = selectedIndexes ? selectedIndexes.includes(i) : Boolean(figmaSelected);',
    `    return { role: 'option', id: \`\${labelId}-\${i}\`, 'aria-selected': on, ${c.stateProp}: on, 'data-ds-item': '', 'data-ds-index': i, ...(i === active ? { 'data-force-state': 'focus' } : {}), onClick: (event: { currentTarget: Element }) => { setActive(i); toggle(i, event.currentTarget.closest('[role=listbox]')); } };`,
    '  };',
  )
  else lines.push(
    "  const itemProps = (i: number, _figma?: boolean, kind: string = 'item') => {",
    "    if (kind === 'separator') return { role: 'separator' };",
    "    if (kind === 'heading') return { role: 'presentation' };",
    "    return { role: 'menuitem', id: `${labelId}-${i}`, 'data-ds-item': '', 'data-ds-index': i, ...(i === active ? { 'data-force-state': 'focus' } : {}) };",
    '  };',
  )
  lines.push(
    '  /** Arrow keys, Home and End move the active item; Enter and Space choose it. */',
    '  const moveActive = (event: KeyboardEvent<HTMLDivElement>) => {',
    '    onKeyDown?.(event);',
    "    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-ds-item]')];",
    '    if (!items.length) return;',
    '    const at = items.findIndex((x) => Number(x.dataset.dsIndex) === active);',
    "    const step = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[event.key];",
    "    const to = step !== undefined ? (at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length) : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;",
    '    if (to >= 0) {',
    '      event.preventDefault();',
    '      setActive(Number(items[to]!.dataset.dsIndex));',
    "      items[to]!.scrollIntoView?.({ block: 'nearest' });",
    "    } else if ((event.key === ' ' || event.key === 'Enter') && at >= 0) {",
    '      event.preventDefault();',
    '      items[at]!.click();',
    '    }',
    '  };',
  )
  // An empty list or menu is not one: where Figma shows no items (loading, empty), the role and its keyboard go.
  const h = c.hiddenWhen;
  const busy = h?.values.find((v) => /load|busy|pending/.test(v));
  const name = c.labelPath ? "'aria-labelledby': labelId" : `'aria-label': ${JSON.stringify(c.defaultLabel ?? 'List')}`;
  lines.push(
    ...(h ? [`  const listed = !${JSON.stringify(h.values)}.includes(String(${h.prop}));`] : []),
    `  const listProps = ${h ? 'listed ? ' : ''}{ role: '${c.role}', tabIndex: 0, 'aria-activedescendant': active >= 0 ? \`\${labelId}-\${active}\` : undefined, ${name}, ${c.item === 'option' ? "'aria-multiselectable': multiple || undefined, " : ''}onKeyDown: moveActive }${h ? ` : { onKeyDown${busy ? `, 'aria-busy': ${h.prop} === ${JSON.stringify(busy)} || undefined` : ''} }` : ''};`,
  );
  return lines.join('\n') + '\n';
}

/** Which WAI-ARIA pattern a generic component follows, if any (the file header and the docs say so). */
export function packName(x: { combo?: Combo; collection?: Collection; disclosure?: boolean; rootTag?: string }): string | undefined {
  if (x.combo) return x.combo.kind === 'combobox' ? 'combobox (select-only)' : 'menu button';
  if (x.collection) return ({ tablist: 'tabs', radiogroup: 'radio group', listbox: 'listbox', menu: 'menu', group: x.collection.item === 'checkbox' ? 'checkbox' : undefined } as Record<string, string | undefined>)[x.collection.role];
  if (x.disclosure) return 'disclosure';
  return x.rootTag === 'button' ? 'button' : x.rootTag === 'a' ? 'link' : undefined;
}
export const behaviourLine = (pack?: string) => (pack ? `Behaviour: WAI-ARIA ${pack} pattern, recognised from the Figma structure (see the notes in the docs page).` : 'Behaviour (keyboard, focus, ARIA role) is not specified in Figma and is not generated.');

/** React body for a select-only combobox: open state, ids, the field's props and keyboard. */
function comboBody(c: Combo, hasDisabled: boolean): string {
  const p = c.axis.prop;
  const disabled = hasDisabled ? 'disabled' : undefined;
  const derived = c.axis.boolean ? `  const ${p} = isOpen;` : `  const ${p} = isOpen ? ${JSON.stringify(c.open)} : ${p}Prop === ${JSON.stringify(c.open)} ? ${JSON.stringify(c.closed)} : ${p}Prop;`;
  // A combobox needs a name: the label layer, or a default. A menu button is named by its content unless one is given.
  const fallback = c.kind === 'combobox' ? ` ?? ${JSON.stringify(c.defaultLabel)}` : '';
  const named = c.label ? (c.labelShown ? `'aria-labelledby': ${c.labelShown} ? labelId : undefined, 'aria-label': ${c.labelShown} ? undefined : ariaLabel${fallback}` : `'aria-labelledby': labelId, 'aria-label': ariaLabel`) : `'aria-label': ariaLabel${fallback}`;
  return [
    `  const [innerOpen, setInnerOpen] = useState(defaultOpen ?? ${c.axis.boolean ? `${p}Prop === true` : `${p}Prop === ${JSON.stringify(c.open)}`});`,
    '  const isOpen = open ?? innerOpen;',
    derived,
    '  const popupId = useId();',
    '  const fieldId = useId();',
    '  const labelId = useId();',
    '  const setOpen = (next: boolean) => {',
    ...(disabled ? [`    if (${disabled}) return;`] : []),
    '    if (open === undefined) setInnerOpen(next);',
    '    onOpenChange?.(next);',
    '  };',
    '  /** Enter, Space and ArrowDown open the popup; ArrowDown again moves focus into it (its list or menu). */',
    '  const comboboxKeyDown = (event: KeyboardEvent<HTMLElement>) => {',
    "    if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') return;",
    '    event.preventDefault();',
    '    if (!isOpen) setOpen(true);',
    "    else if (event.key === 'ArrowDown') document.getElementById(popupId)?.querySelector<HTMLElement>('[role=listbox], [role=menu], [tabindex]')?.focus();",
    '    else setOpen(false);',
    '  };',
    '  /** Escape closes the popup from the field or from inside it, and focus returns to the field. */',
    '  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {',
    '    onKeyDown?.(event);',
    "    if (event.key !== 'Escape' || !isOpen) return;",
    '    event.preventDefault();',
    '    setOpen(false);',
    '    document.getElementById(fieldId)?.focus();',
    '  };',
    `  const comboboxProps = { id: fieldId, role: ${JSON.stringify(c.kind === 'combobox' ? 'combobox' : 'button')}, tabIndex: ${disabled ? `${disabled} ? -1 : 0` : '0'}, 'aria-expanded': isOpen, 'aria-haspopup': ${JSON.stringify(c.kind === 'combobox' ? 'listbox' : 'menu')} as const, 'aria-controls': popupId, ${named}, onClick: () => setOpen(!isOpen), onKeyDown: comboboxKeyDown };`,
    '',
  ].join('\n');
}

/** Component-body code for a collection: label id, selection state, item props and arrow-key navigation (React). */
function collectionBody(c: Collection): string {
  if (listy(c)) return listBody(c);
  const lines = ['  const labelId = useId();'];
  if (c.selection === 'single') {
    lines.push(
      '  const [innerSelected, setInnerSelected] = useState(defaultSelected);',
      '  const selectedIndex = selected ?? innerSelected;',
      '  const select = (i: number) => {',
      '    if (selected === undefined) setInnerSelected(i);',
      '    onSelectedChange?.(i);',
      '  };',
      '  /** Only the selected item (or the first, when none is) is in the tab order. */',
      '  const focusable = (i: number) => i === (selectedIndex >= 0 ? selectedIndex : 0);',
      c.item === 'tab'
        ? `  const itemProps = (i: number) => ({ role: 'tab', 'aria-selected': i === selectedIndex, tabIndex: focusable(i) ? 0 : -1, ${c.stateProp}: i === selectedIndex, 'data-ds-item': '', onClick: () => select(i) });`
        : "  const itemProps = (i: number) => ({ checked: i === selectedIndex, onCheckedChange: () => select(i), tabIndex: focusable(i) ? 0 : -1, 'data-ds-item': '' });",
      '  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {',
      '    onKeyDown?.(event);',
      "    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key];",
      "    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-ds-item]')];",
      '    const at = items.findIndex((x) => x === document.activeElement || x.contains(document.activeElement));',
      "    const to = at < 0 ? -1 : step !== undefined ? (at + step + items.length) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;",
      '    if (to < 0) return;',
      '    event.preventDefault();',
      '    items[to]!.focus();',
      '    items[to]!.click();',
      '  };',
    )
  } else if (c.selection === 'multi') {
    lines.push(
      '  const [innerSelected, setInnerSelected] = useState(defaultSelected);',
      '  const selectedIndexes = selected ?? innerSelected;',
      '  const toggle = (i: number) => {',
      '    const next = selectedIndexes.includes(i) ? selectedIndexes.filter((x) => x !== i) : [...selectedIndexes, i].sort((a, b) => a - b);',
      '    if (selected === undefined) setInnerSelected(next);',
      '    onSelectedChange?.(next);',
      '  };',
      `  const itemProps = (i: number) => ({ role: 'checkbox', 'aria-checked': selectedIndexes.includes(i), tabIndex: 0, ${c.stateProp}: selectedIndexes.includes(i), 'data-ds-item': '', onClick: () => toggle(i), onKeyDown: (event: KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle(i); } } });`,
    )
  }
  return lines.join('\n') + '\n';
}

/** One value a parent gives every copy of a repeated child: the same for all copies, or numbered by position. */
export interface DrivenProp {
  prop: string;
  /** Same value on every copy. */
  same?: InstanceProp;
  /** Numbered: "1.", "2.", "3." -> prefix + (start + index) + suffix. */
  numbered?: { prefix: string; start: number; suffix: string };
}

/** Props a parent sets on every copy of a repeated child, found by comparing what Figma gives each copy. */
export function drivenProps(copies: InstanceProp[][], defaults: Record<string, string | boolean> = {}): DrivenProp[] {
  const out: DrivenProp[] = [];
  // A copy that keeps the child's default has no override for it: use the default, so "1." (default), "2.", "3." is a sequence.
  copies = copies.map((ps) => [...ps, ...Object.entries(defaults).filter(([k]) => !ps.some((x) => x.prop === k)).map(([k, v]) => (typeof v === 'boolean' ? { prop: k, kind: 'boolean' as const, value: v } : { prop: k, kind: 'string' as const, value: v }))]);
  const names = [...new Set(copies.flatMap((ps) => ps.map((x) => x.prop)))];
  const code = (x: InstanceProp) => (x.kind === 'expr' ? `expr:${x.expr((r) => r)}` : `${x.kind}:${JSON.stringify(x.value)}`);
  for (const name of names) {
    const vals = copies.map((ps) => ps.find((x) => x.prop === name));
    if (vals.some((v) => !v || v.kind === 'force-state' || v.kind === 'toggle')) continue;
    if (new Set(vals.map((v) => code(v!))).size === 1) { if (!(name in defaults) || code(vals[0]!) !== code({ prop: name, ...(typeof defaults[name] === 'boolean' ? { kind: 'boolean', value: defaults[name] } : { kind: 'string', value: defaults[name] }) } as InstanceProp)) out.push({ prop: name, same: vals[0]! }); continue; }
    const m = vals.map((v) => (v!.kind === 'string' ? /^(\D*?)(\d+)(\D*)$/.exec(v!.value) : null));
    const first = m[0];
    if (first && m.every((x, k) => x && Number(x[2]) === Number(first[2]) + k && x[1] === first[1] && x[3] === first[3])) out.push({ prop: name, numbered: { prefix: first[1]!, start: Number(first[2]), suffix: first[3]! } });
  }
  return out;
}

/** "close-button" -> "Close". Used as an accessible name for icon-only nested buttons. */
export function humanize(layer: string): string {
  const words = layer.replace(/^_+/, '').replace(/[-_ ]?(button|btn|icon)$/i, '').split(/[-_\s]+/).filter(Boolean);
  const text = words.join(' ').toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : layer;
}

/** JSX attributes for one placed instance: its variant, plus the boolean and text overrides set on it in Figma. */
export function instanceRef(entry: RegistryEntry, part: IRPart, icons: Map<string, IconAsset>, lookup?: EntryLookup): InstanceRef {
  const plan = propPlan(entry.set);
  const variant = entry.set.variants.find((v) => v.nodeId === part.instanceComponentId);
  const sw = entry.kind === 'switch' || entry.kind === 'radio' ? switchAxis(plan.axes) : undefined;
  const props = (variant ? variantProps(plan.axes.filter((a) => a !== sw?.axis), variant.values) : []).map((x) => (entry.kind === 'input' && x.prop === 'type' ? { ...x, prop: 'appearance' } : x));
  const over = part.instanceProps ?? {};
  const notes: string[] = [];
  if (sw && variant) {
    if (kebab(variant.values[sw.axis.figma] ?? '') === sw.on) props.push({ prop: 'defaultChecked', kind: 'boolean', value: true });
  }
  // A nested button or link with no text (or in an icon-only variant) is named from its Figma layer name.
  const iconOnly = variant && plan.axes.some((x) => /icon.?only/i.test(x.figma) && /^true$/i.test(variant.values[x.figma] ?? ''));
  if (variant && (entry.kind === 'button' || entry.kind === 'link') && (!plan.texts.length || iconOnly)) {
    const label = humanize(part.name.replace(/([a-z])([A-Z])/g, '$1 $2'));
    props.push({ prop: 'aria-label', kind: 'string', value: label });
    notes.push(`Nested ${entry.component} "${part.path}" has no text; it is named "${label}" from its Figma layer name. Confirm the wording.`);
  }
  if (sw && variant && entry.kind === 'switch' && !plan.texts.length) {
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
    const toggles = mergedToggles(entry);
    for (const b of plan.booleans) {
      const t = toggles.find((x) => x.bool === b.p.name);
      const v = over[b.p.name];
      if (t) {
        // The slot shows when its toggle is on: React gets the icon the instance shows (or null), Lit the boolean.
        const shown = typeof v === 'boolean' ? v : t.default;
        const swapped = part.instanceSwaps?.[t.swap] ?? part.innerIcons?.find((i) => i.layer === t.layer)?.name;
        const asset = shown ? icons.get(swapped ?? t.icon ?? '') : undefined;
        if (shown === t.default && !(shown && swapped && swapped !== t.icon)) continue;
        if (shown && !asset) { notes.push(`Nested ${entry.component} "${part.path}" shows its "${t.swap}" slot, which holds no known icon: the slot content is not set.`); continue; }
        props.push({ prop: b.prop, kind: 'toggle', value: shown, slot: t.slotProp, ...(asset ? { icon: asset.name } : {}), ...(asset && t.size ? { size: t.size } : {}) });
        if (asset) usesIcon = true;
        continue;
      }
      if (typeof v === 'boolean' && v !== (String(b.p.default) === 'true')) props.push({ prop: b.prop, kind: 'boolean', value: v });
    }
    for (const t of plan.texts) {
      const v = over[t.p.name];
      if (typeof v === 'string' && v !== String(t.p.default)) props.push({ prop: t.prop, kind: 'string', value: v });
    }
    // Configuration of the component's exposed nested instances (Accordion -> item -> Leading=Icon).
    for (const { cp, read } of placedApi(entry, lookup).filter((x) => x.cp.exposed)) {
      const v = read(part);
      if (v === cp.default) continue;
      props.push(typeof v === 'boolean' ? { prop: cp.prop, kind: 'boolean', value: v } : { prop: cp.prop, kind: 'string', value: v });
    }
  }
  return { component: entry.component, importPath: entry.importPath, kind: entry.kind, attrs: reactAttrs(props, text), props, ...(text !== undefined ? { text } : {}), usesIcon, notes };
}

// ---------------------------------------------------------------------------------------------
// Nested components: the API a placed instance has (its own props and its exposed nested props),
// and the values Figma gives them in each variant of the parent.

/** One prop of a nested generic component, with how to read its value from a placed Figma instance. */
export interface ChildProp {
  /** Prop name on the nested component. */
  prop: string;
  /** Figma name: the variant axis or the property. */
  figma: string;
  type: 'string' | 'boolean';
  /** TypeScript type (React quoting). */
  tsType: (quote: (s: string) => string) => string;
  /** Default value on the nested component. */
  default: string | boolean;
  axis?: AxisInfo;
  /** Set for a prop that comes from one of the component's exposed nested instances. */
  exposed?: { path: string; name: string; entry: RegistryEntry; child: ChildProp };
  /** An exposed property that Figma sets per variant: no fixed default, it follows the variant unless passed. */
  derived?: boolean;
}

export function defaultVariantOf(set: IRComponentSet): IRVariant | undefined {
  const defaults = Object.fromEntries(set.properties.filter((p) => p.type === 'VARIANT').map((p) => [p.name, String(p.default)]));
  return set.variants.find((v) => Object.entries(defaults).every(([k, x]) => v.values[k] === x)) ?? set.variants[0];
}

/** The component's own configurable props: variant axes that are not states, booleans and texts. */
export function childApi(entry: RegistryEntry): ChildProp[] {
  if (!GENERIC_LIKE.has(entry.kind)) return [];
  const plan = propPlan(entry.set);
  return [
    ...plan.axes.filter((a) => a.kind === 'variant' && a.options.length > 1).map<ChildProp>((a) => ({ prop: a.prop, figma: a.figma, type: a.boolean ? 'boolean' : 'string', tsType: (qq) => axisType(a, qq), default: a.boolean ? a.defaultValue === 'true' : a.defaultValue, axis: a })),
    ...plan.booleans.filter((b) => !mergedToggles(entry).some((t) => t.bool === b.p.name)).map<ChildProp>((b) => ({ prop: b.prop, figma: b.p.name, type: 'boolean', tsType: () => 'boolean', default: String(b.p.default) === 'true' })),
    ...plan.texts.map<ChildProp>((t) => ({ prop: t.prop, figma: t.p.name, type: 'string', tsType: () => 'ReactNode', default: String(t.p.default) })),
  ];
}

/** A prop's value on one Figma instance (its variant and its property overrides). */
export function childValue(entry: RegistryEntry, cp: ChildProp, componentId: string | undefined, props: Record<string, string | boolean> | undefined): string | boolean {
  if (cp.axis) {
    const v = entry.set.variants.find((x) => x.nodeId === componentId);
    const value = cp.axis.values.find((x) => x.figma === v?.values[cp.axis!.figma])?.value ?? cp.axis.defaultValue;
    return cp.axis.boolean ? value === 'true' : value;
  }
  const raw = props?.[cp.figma];
  if (cp.type === 'boolean') return typeof raw === 'boolean' ? raw : cp.default;
  return typeof raw === 'string' ? raw : cp.default;
}

export type EntryLookup = (componentId: string) => RegistryEntry | undefined;

/**
 * Props a component takes from its exposed nested instances (Figma "expose nested instance"):
 * the nested component's own props, named as on the nested component, or prefixed with the layer name on a clash.
 * Defaults are the values the component's default variant gives them.
 */
export function exposedApi(set: IRComponentSet, lookup: EntryLookup | undefined, taken: Iterable<string> = []): ChildProp[] {
  if (!lookup) return [];
  const plan = propPlan(set);
  const used = new Set<string>([...plan.axes.map((a) => a.prop), ...plan.booleans.map((b) => b.prop), ...plan.texts.map((t) => t.prop), ...taken, ...RESERVED, 'disabled', 'children', 'className', 'style']);
  const dv = defaultVariantOf(set);
  const out: ChildProp[] = [];
  const seen = new Set<string>();
  for (const v of dv ? [dv, ...set.variants.filter((x) => x !== dv)] : set.variants) {
    for (const p of v.parts) {
      if (!p.exposed || !p.instanceComponentId || seen.has(p.path) || isIcon(p)) continue;
      const entry = lookup(p.instanceComponentId);
      if (!entry || entry.set === set) continue;
      seen.add(p.path);
      const own = dv?.parts.find((x) => x.path === p.path && x.type === 'INSTANCE') ?? p;
      for (const cp of childApi(entry)) {
        let prop = cp.prop;
        if (used.has(prop)) prop = camel(`${p.name.replace(/^_+/, '')} ${cp.prop.replace(/([a-z])([A-Z])/g, '$1 $2')}`);
        for (let i = 2; used.has(prop); i++) prop = `${prop}${i}`;
        used.add(prop);
        out.push({ ...cp, prop, default: childValue(entry, cp, own.instanceComponentId, own.instanceProps), exposed: { path: p.path, name: p.name, entry, child: cp } });
      }
    }
  }
  return out;
}

/** Every prop a placed instance of entry can be given, and how to read each one from the placed IRPart. */
export function placedApi(entry: RegistryEntry, lookup: EntryLookup | undefined): { cp: ChildProp; read: (part: IRPart) => string | boolean }[] {
  const own = childApi(entry).map((cp) => ({ cp, read: (part: IRPart) => childValue(entry, cp, part.instanceComponentId, part.instanceProps) }));
  const exposed = exposedApi(entry.set, lookup).map((cp) => ({
    cp,
    read: (part: IRPart) => {
      const e = cp.exposed!;
      const list = part.exposedInstances ?? [];
      const x = list.find((i) => i.path === e.path) ?? list.find((i) => i.name === e.name);
      return x ? childValue(e.entry, e.child, x.componentId, x.props) : cp.default;
    },
  }));
  return [...own, ...exposed];
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

/** Like lookupExpr, for tables whose values and fallback are code literals (JSON): booleans, strings. */
export function lookupValueExpr(l: VariantLookup, ref: (prop: string) => string, type: string): string {
  const r = (p: string) => (p === '$checked' && l.checked ? `(${ref(p)} ? ${JSON.stringify(l.checked.on)} : ${JSON.stringify(l.checked.off)})` : ref(p));
  const entries = Object.entries(l.values);
  const table = entries.length ? `(({ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(', ')} } as Record<string, ${type}>)[String(${r(l.prop)})] ?? ${l.fallback})` : l.fallback;
  return l.override ? `(String(${r(l.override.prop)}) === ${JSON.stringify(l.override.value)} ? ${l.override.result} : ${table})` : table;
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
  /** Content slot: an instance-swap property bound to this layer, or a placeholder "Slot" instance (phase 2). */
  slot?: SlotInfo;
}

/** A layer whose content the consumer provides; the Figma instance is the default. */
export interface SlotInfo {
  /** React prop (ReactNode); "children" for the main placeholder. */
  prop: string;
  /** Figma instance-swap property, or the layer name for a placeholder. */
  figma: string;
  kind: 'swap' | 'placeholder';
  /** Web Components slot name ("" for the default slot). */
  name: string;
  description?: string;
  /** The Figma boolean that shows this slot, merged into it: the slot prop decides visibility. */
  toggle?: { figma: string; prop: string; default: boolean; icon?: string; size?: [number, number] };
}

const PLACEHOLDER = /^[._\s]*slot$/i;
/** Viewport values -> CSS media conditions, from generate.breakpoints in the config (keys kebab-cased). */
let BREAKPOINTS: Record<string, string> = {};
export function setBreakpoints(map: Record<string, string> | undefined): void {
  BREAKPOINTS = Object.fromEntries(Object.entries(map ?? {}).map(([k, v]) => [kebab(k), v]));
}
const VIEWPORT = /screen|device|breakpoint|viewport|platform/i;
/** Variant axes about the viewport whose values have configured breakpoints: in code they follow the viewport. */
export function responsiveAxes(axes: AxisInfo[]): AxisInfo[] {
  return axes.filter((a) => a.kind === 'variant' && !a.boolean && VIEWPORT.test(a.figma) && a.options.some((o) => BREAKPOINTS[o]));
}
/**
 * Copies every rule that styles one value of a responsive axis to the "responsive" value: rules for values without a
 * breakpoint first (the base), then each configured value inside its media query, so the matching viewport wins.
 */
export function makeResponsive(css: string, attr: string, values: string[]): string {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) { blocks.push(css.slice(start, i + 1).trim()); start = i + 1; }
  }
  const forValue = (v: string) => blocks.filter((b) => !b.startsWith('@') && b.slice(0, b.indexOf('{')).includes(`[data-${attr}="${v}"]`)).map((b) => b.split(`[data-${attr}="${v}"]`).join(`[data-${attr}="responsive"]`));
  const base = values.filter((v) => !BREAKPOINTS[v]).flatMap(forValue);
  const media = values.filter((v) => BREAKPOINTS[v] && forValue(v).length).map((v) => `@media ${BREAKPOINTS[v]} {\n${forValue(v).map((b) => `  ${b.replace(/\n/g, '\n  ')}`).join('\n')}\n}`);
  if (!base.length && !media.length) return css;
  return `${css.trimEnd()}\n\n/* ${attr}: not set, so it follows the viewport (generate.breakpoints in ds-sync.config.json). */\n${[...base, ...media].join('\n')}\n`;
}
/** Registry kinds rendered by the generic template, whose props a parent can set on nested instances. */
const GENERIC_LIKE = new Set<RegistryEntry['kind']>(['generic', 'disclosure', 'button', 'link']);

/** Every template writes its own React import line; repeated children (Children.map, cloneElement) can appear in any
 * of them. Adds the React APIs a component uses but does not import, whichever template wrote it. */
export function withReactImports(tsx: string): string {
  const imported = new Set([...tsx.matchAll(/^import (?:type )?\{([^}]*)\} from 'react';$/gm)].flatMap((m) => m[1]!.split(',').map((x) => x.trim().replace(/^type /, ''))));
  const missing = ['Children', 'cloneElement', 'isValidElement', 'useId', 'useState'].filter((n) => !imported.has(n) && new RegExp(`\\b${n}\\(|\\b${n}\\.`).test(tsx));
  if (!missing.length) return tsx;
  const line = `import { ${missing.join(', ')} } from 'react';\n`;
  const first = tsx.search(/^import /m);
  return first < 0 ? line + tsx : tsx.slice(0, first) + line + tsx.slice(first);
}

/** Registry kinds that are controls: a component holding one must not itself be a control. */
export const INTERACTIVE_KINDS = new Set<string>(['button', 'link', 'action', 'switch', 'radio', 'radio-field', 'radio-group', 'checkbox', 'disclosure', 'combobox', 'input']);

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

/** CSS properties a Figma instance override sets on a layer inside the placed component. */
const INNER_PROPS = (field: string, text: boolean): string[] =>
  /^fontSize$/.test(field) ? ['font-size'] : /^(fontWeight|fontPostScriptName|fontStyle)$/.test(field) ? ['font-weight'] : field === 'fontFamily' ? ['font-family']
    : /^lineHeight/.test(field) ? ['line-height'] : field === 'letterSpacing' ? ['letter-spacing'] : field === 'fills' ? (text ? ['color'] : ['background', 'background-color'])
      : field === 'inheritTextStyleId' ? ['font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing'] : field === 'inheritFillStyleId' ? (text ? ['color'] : ['background', 'background-color'])
      : field === 'textCase' ? ['text-transform'] : field === 'textDecoration' ? ['text-decoration'] : field === 'visible' ? ['display'] : field === 'opacity' ? ['opacity'] : [];

export const isIcon = (p: IRPart) => p.type === 'INSTANCE' && Boolean(p.icon || (p.instanceOf && /^icons?\//i.test(p.instanceOf)));
export const SHAPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON', 'REGULAR_POLYGON']);

export function genericTemplate(ctx: TemplateContext, name: string, opts: { title: string; instance: (part: IRPart) => InstanceRef | undefined; lookup?: EntryLookup; behavior?: Behavior; related?: { control?: { name: string; set: IRComponentSet } } }): TemplateResult {
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
  // A control may not contain other controls (WCAG: nested interactive elements). A component named or shaped like a
  // button, a link or a switch group that holds nested controls becomes a plain container; its controls stay usable.
  const nestedControls = opts.lookup ? [...new Set(set.variants.flatMap((v) => v.parts.filter((x) => x.type === 'INSTANCE' && x.instanceComponentId).map((x) => opts.lookup!(x.instanceComponentId!)).filter((e): e is RegistryEntry => Boolean(e && e.set !== set && INTERACTIVE_KINDS.has(e.kind))).map((e) => e.component)))] : [];
  if (nestedControls.length && (opts.behavior === 'button' || opts.behavior === 'link' || ((opts.behavior === 'switch' || opts.behavior === 'checkbox-single') && nestedControls.length > 1))) {
    gaps.push(`${name} contains other controls (${nestedControls.join(', ')}), so it is not itself a ${opts.behavior === 'link' ? 'link' : opts.behavior === 'button' ? 'button' : 'switch'}: a control inside a control is not accessible. It is a plain container; its controls work on their own.`);
    opts = { ...opts, behavior: undefined };
  }
  const toggleRole = opts.behavior === 'switch' ? 'switch' as const : opts.behavior === 'checkbox-single' ? 'checkbox' as const : opts.behavior === 'radio-single' ? 'radio' as const : undefined;
  const found = toggleRole ? switchAxis(axes) : undefined;
  if (opts.behavior === 'switch' && !found) gaps.push('Switch template: no on/off variant axis found (for example Value=Off/On), so no switch behaviour was generated.');
  const sw: SwitchBehavior | undefined = found && {
    ...found,
    ...(() => { const busy = axes.find((a) => a !== found.axis && a.options.includes('loading')); return busy ? { busy } : {}; })(),
    label: humanize(name.replace(/([a-z])([A-Z])/g, '$1 $2')),
    focusColor: ctx.resolver.byName(/(^|\/)(border\/)?(interactive\/)?focus(ed)?$/) ?? 'currentColor',
    role: toggleRole!,
    ...(toggleRole !== 'switch' && set.properties.some((x) => x.type === 'TEXT') ? { labelled: true } : {}),
    ...(() => { const mixed = toggleRole === 'checkbox' ? axes.find((a) => a !== found.axis && a.boolean && /indeterm|intermed|mixed/i.test(a.figma)) : undefined; return mixed ? { mixed } : {}; })(),
  };
  // Button and link packs: the generic layers inside a native <button> or <a> root (WAI-ARIA button and link patterns).
  const rootTag = opts.behavior === 'button' ? 'button' as const : opts.behavior === 'link' ? 'a' as const : 'div' as const;
  const busyAxis = rootTag === 'button' ? axes.find((a) => a.boolean && /loading|busy/i.test(a.figma)) : undefined;
  if (rootTag === 'button') assumptions.push(`Behaviour from the WAI-ARIA button pattern: a native <button type="button">. Tab focuses it; Enter and Space activate it${axes.some((a) => a.values.some((v) => v.role === 'disabled')) ? '; disabled is the native attribute' : ''}${busyAxis ? `; ${busyAxis.prop} sets aria-busy` : ''}.`);
  if (rootTag === 'a') assumptions.push('Behaviour from the WAI-ARIA link pattern: a native <a>. Pass href; Tab focuses it and Enter follows it.');
  // Without text (or with icon-only variants) the native element has no accessible name: stories give one, consumers must too.
  const needsName = rootTag !== 'div' && (axes.some((a) => /icon.?only/i.test(a.figma)) || !set.properties.some((x) => x.type === 'TEXT'));
  if (needsName) gaps.push(`${name} ${set.properties.some((x) => x.type === 'TEXT') ? 'has an icon-only variant' : 'has no text label in Figma'}: give each ${set.properties.some((x) => x.type === 'TEXT') ? 'icon-only ' : ''} ${rootTag === 'a' ? 'link' : 'button'} an accessible name with aria-label.`);
  const disclosure = opts.behavior === 'disclosure' ? disclosureLayers(set, axes) : undefined;
  const responsive = new Set(responsiveAxes(axes));
  for (const a of responsive) assumptions.push(`${a.figma} follows the viewport when ${a.prop} is not set: ${a.options.map((o) => `${o}${BREAKPOINTS[o] ? ` at ${BREAKPOINTS[o]}` : ' otherwise'}`).join(', ')} (generate.breakpoints in ds-sync.config.json). Set ${a.prop} to fix one layout.`);
  if (opts.behavior === 'disclosure' && !disclosure && !set.properties.some((x) => x.type === 'BOOLEAN' && /expand|open/i.test(x.name))) gaps.push('Disclosure: an expanded axis exists, but no single header and panel were found in the layers, so no expand/collapse behaviour was generated.');
  if (disclosure) assumptions.push(`Behaviour from the WAI-ARIA disclosure pattern, recognised from structure: the "${disclosure.header.split('/').pop()}" layer is a native button with aria-expanded and aria-controls; it shows and hides "${disclosure.panel.split('/').pop()}", which Figma shows only when ${disclosure.axis.figma} is true. Tab focuses it; Enter and Space toggle it. ${disclosure.axis.prop} controls it; defaultExpanded and onExpandedChange make it uncontrolled.`);
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
    ? sw.role === 'radio'
      ? `Behaviour from the WAI-ARIA radio pattern, recognised from the ${sw.axis.figma} axis: a native button with role="radio" and aria-checked. Clicking or Space selects it; it does not deselect itself (a radio group selects another one and moves focus with the arrow keys). Figma ${sw.axis.figma}=${sw.axis.values.find((v) => v.value === sw.on)?.figma} is checked.`
      : sw.role === 'checkbox'
      ? `Behaviour from the WAI-ARIA checkbox pattern, recognised from the ${sw.axis.figma} axis: a native button with role="checkbox" and aria-checked${sw.mixed ? ` ("mixed" when ${sw.mixed.prop} is set, from Figma ${sw.mixed.figma})` : ''}. Tab focuses it; Space toggles it. Figma ${sw.axis.figma}=${sw.axis.values.find((v) => v.value === sw.on)?.figma} is checked.`
      : `Behaviour from the WAI-ARIA switch pattern: a native button with role="switch" and aria-checked. Tab focuses it; Space and Enter toggle it. Figma ${sw.axis.figma}=${sw.axis.values.find((v) => v.value === sw.on)?.figma} is checked.`
    : 'Generated with the generic template: visuals come from Figma; keyboard, focus and ARIA behaviour are not specified.');
  const propAxes = axes.filter((a) => a.options.length > 1 && a !== sw?.axis && a !== radio?.axis);
  const stateProp = propAxes.find((a) => a.prop === 'state');
  const hasState = (v: string) => Boolean(stateProp?.options.includes(v));

  // Props
  const { booleans, texts, swaps, hasDisabled, toggles } = propPlan(set);
  // The input pack passes native input attributes through: a Figma property with the same name gets a suffix.
  if (opts.behavior === 'input') {
    const native = new Set(['value', 'defaultValue', 'name', 'type', 'id', 'maxLength', 'checked', 'onChange', 'invalid', 'onClear', 'style', 'className']);
    for (const x of booleans) if (native.has(x.prop)) x.prop = `${x.prop}Prop`;
    for (const x of texts) if (native.has(x.prop)) x.prop = `${x.prop}Text`;
  }
  // A toggle merged into its slot is an expression on the slot prop: not set → the Figma default, null or false → hidden.
  const merged = new Map<string, SlotInfo>();
  const shownExpr = (x: SlotInfo) => (x.toggle!.default ? `(${x.prop} !== null && ${x.prop} !== false)` : `(${x.prop} != null && ${x.prop} !== false)`);
  const boolFor = (figma?: string) => { const m = figma ? merged.get(figma) : undefined; return m ? shownExpr(m) : booleans.find((b) => b.p.name === figma)?.prop; };
  const textFor = (figma?: string) => texts.find((t) => t.p.name === figma)?.prop;

  // Styles
  const all = layers(set, defaultVariant);
  const byPath = new Map(all.map((l) => [l.path, l]));
  // A button or link whose label text is hidden in some variants (icon-only) has no name there: its label text names
  // it (aria-label, which a caller's own aria-label overrides). Found from structure: the layer bound to a text
  // property, or one of its ancestors, is hidden or missing in a variant.
  const nameFrom = rootTag === 'div' ? undefined : (() => {
    for (const t of texts) {
      const layer = all.find((l) => l.part.type === 'TEXT' && l.part.refs?.characters === t.p.name);
      if (!layer) continue;
      const chain = layer.path.split('/').map((_, i, xs) => xs.slice(0, i + 1).join('/'));
      if (set.variants.some((v) => chain.some((path) => { const p = v.parts.find((x) => x.path === path); return !p || p.hidden; }))) return t.prop;
    }
    return undefined;
  })();
  if (nameFrom) assumptions.push(`Where a variant hides the label (icon-only), the ${rootTag === 'a' ? 'link' : 'button'} is named by its ${nameFrom} text (aria-label); pass aria-label to name it differently.`);
  // The component names itself now: the "give it a name" gap no longer applies.
  if (nameFrom) for (let i = gaps.length - 1; i >= 0; i--) if (/icon-only variant: give each icon-only/.test(gaps[i]!)) gaps.splice(i, 1);
  // Slots (phase 2): content the consumer provides, with the Figma instance as the default.
  // An instance-swap property bound to a layer's main component is a slot; so is a placeholder instance of a
  // component named "Slot" (a common Figma convention for "content goes here"). Packs with their own children skip it.
  const slotList: SlotInfo[] = [];
  const mergedBooleans: typeof booleans = [];
  const slotsEnabled = !opts.behavior || opts.behavior === 'switch' || opts.behavior === 'checkbox-single' || opts.behavior === 'disclosure' || opts.behavior === 'button' || opts.behavior === 'link' || opts.behavior === 'combobox';
  if (slotsEnabled) {
    const taken = new Set<string>([...axes.map((a) => a.prop), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop), 'disabled', 'checked', 'className', 'style', 'children', ...JS_RESERVED]);
    const claim = (base: string) => { let n = base || 'slot'; if (taken.has(n)) n = `${n}Slot`; for (let i = 2; taken.has(n); i++) n = `${base}Slot${i}`; taken.add(n); return n; };
    for (const l of all) {
      if (l.part.type !== 'INSTANCE' || l.copies?.length) continue;
      const swap = l.part.refs?.mainComponent ? swaps.find((x) => x.name === l.part.refs!.mainComponent) : undefined;
      if (swap && !slotList.some((x) => x.figma === swap.name)) {
        const tg = toggles.find((t) => t.swap === swap.name);
        const prop = tg && !taken.has(tg.slotProp) ? (taken.add(tg.slotProp), tg.slotProp) : claim(decidedName(set, swap.name) ?? camel(swap.name.replace(/[^A-Za-z0-9 _-]+/g, ' ').trim()));
        const description = decidedDescription(set, swap.name);
        l.slot = { prop, figma: swap.name, kind: 'swap', name: kebab(prop), ...(description ? { description } : {}) };
        slotList.push(l.slot);
        continue;
      }
      const entry = !swap && l.part.instanceComponentId && opts.lookup ? opts.lookup(l.part.instanceComponentId) : undefined;
      if (entry && PLACEHOLDER.test(entry.set.name)) {
        l.slot = { prop: '', figma: l.part.name, kind: 'placeholder', name: '' };
        slotList.push(l.slot);
      }
    }
    // One placeholder is children; several are named after the layer that holds them (body or content → children).
    const holders = slotList.filter((x) => x.kind === 'placeholder');
    const parentName = (x: SlotInfo) => { const l = all.find((y) => y.slot === x)!; return byPath.get(l.parent)?.part.name ?? l.part.name; };
    const main = holders.length === 1 ? holders[0] : holders.find((x) => /body|content|main/i.test(parentName(x)));
    if (main) { main.prop = 'children'; main.name = ''; }
    for (const x of holders.filter((y) => y !== main)) { x.prop = claim(camel(`${parentName(x).replace(/[^A-Za-z0-9 _-]+/g, ' ')} content`)); x.name = kebab(x.prop); }
    // Toggle and swap pairs become one prop: the slot. The boolean leaves the public API (React).
    for (const t of toggles) {
      const x = slotList.find((y) => y.kind === 'swap' && y.figma === t.swap);
      const at = booleans.findIndex((b) => b.p.name === t.bool);
      if (!x || at < 0 || all.find((l) => l.slot === x)?.copies?.length) continue;
      const [b] = booleans.splice(at, 1);
      x.toggle = { figma: t.bool, prop: b!.prop, default: t.default, ...(t.icon && ctx.icons.get(t.icon) ? { icon: ctx.icons.get(t.icon)!.name } : {}), ...(t.size ? { size: t.size } : {}) };
      if (!x.description && b!.description) x.description = b!.description;
      merged.set(t.bool, x);
      mergedBooleans.push(b!);
    }
  }
  const boundSwaps = new Set(slotList.filter((x) => x.kind === 'swap').map((x) => x.figma));
  const unboundSwaps = swaps.filter((x) => !boundSwaps.has(x.name));
  // Disclosure with a trigger (phase 3): a boolean about being expanded that shows a panel, and a nested button.
  // Combobox (select-only, WAI-ARIA): an axis value that shows a popup holding a list or menu, and a field that opens it.
  const combo: Combo | undefined = (() => {
    if (opts.behavior !== 'combobox') return undefined;
    const axis = axes.find((a) => !a.boolean && a.options.length > 1 && a.options.some((o) => /^(is-)?(open|opened|expanded)$/.test(o))) ?? axes.find((a) => a.boolean && /open|expand/i.test(a.figma));
    if (!axis) return undefined;
    // The combobox's own API is open / defaultOpen / onOpenChange: a Figma axis called "Open" becomes its internal state.
    if (axis.prop === 'open') axis.prop = 'openState';
    const open = axis.boolean ? 'true' : axis.options.find((o) => /^(is-)?(open|opened|expanded)$/.test(o))!;
    const closed = axis.boolean ? 'false' : axis.defaultValue !== open ? axis.defaultValue : axis.options.find((o) => o !== open)!;
    const setName = (l: LayerInfo) => (l.part.instanceComponentId ? opts.lookup?.(l.part.instanceComponentId)?.set.name ?? '' : '');
    const popupText = (l: LayerInfo) => `${l.part.name} ${l.part.instanceOf ?? ''} ${setName(l)}`;
    const popup = all.find((l) => l.part.type === 'INSTANCE' && !isIcon(l.part) && /menu|list|dropdown|popover|option/i.test(popupText(l)) && !/trigger|button|field|input|header|label|footer/i.test(popupText(l)));
    if (!popup) return undefined;
    // The field: a frame named for it, or a nested trigger component that has no behaviour of its own.
    const fieldName = /^(field|input|control|trigger|select|box|input ?field|text ?field|dropdown ?trigger|select ?trigger)$/i;
    const field = all.find((l) => l.part.type !== 'INSTANCE' && l.part.type !== 'TEXT' && !popup.path.startsWith(`${l.path}/`) && fieldName.test(l.part.name.replace(/^[_.\s]+/, '').trim()))
      ?? all.find((l) => l.part.type === 'INSTANCE' && l !== popup && !isIcon(l.part) && (fieldName.test(l.part.name.replace(/^[_.\s]+/, '').trim()) || /trigger/i.test(setName(l))) && l.part.instanceComponentId && opts.lookup?.(l.part.instanceComponentId)?.kind === 'generic');
    if (!field) return undefined;
    // Options or actions: the popup (or something inside it) repeats an item with a selected True/False axis.
    const holdsOptions = (id: string | undefined, depth: number): boolean => {
      const entry = id ? opts.lookup?.(id) : undefined;
      if (!entry || depth > 3) return false;
      if (propPlan(entry.set).axes.some((a) => a.boolean && a.kind === 'variant' && /selected|checked/i.test(a.figma))) return true;
      return (entry.set.variants[0]?.parts ?? []).some((x) => x.type === 'INSTANCE' && x.instanceComponentId !== id && holdsOptions(x.instanceComponentId, depth + 1));
    };
    const kind = holdsOptions(popup.part.instanceComponentId, 0) ? 'combobox' as const : 'menu-button' as const;
    const label = all.find((l) => !l.path.startsWith(`${field.path}/`) && !l.path.startsWith(`${popup.path}/`) && ((l.part.type === 'TEXT' && /^label$/i.test(l.part.refs?.characters ?? l.part.name)) || (l.part.type === 'INSTANCE' && /header|label/i.test(setName(l)))));
    const labelShown = label ? booleans.find((b) => b.p.name === label.part.refs?.visible)?.prop : undefined;
    return { kind, axis, open, closed, field: field.path, popup: popup.path, ...(label ? { label: label.path } : {}), ...(labelShown ? { labelShown } : {}), defaultLabel: humanize(set.name.replace(/\(.*\)/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim()) };
  })();
  if (opts.behavior === 'combobox') {
    if (combo) assumptions.push(`Behaviour from the WAI-ARIA ${combo.kind === 'combobox' ? 'combobox pattern (select-only)' : 'menu button pattern'}, recognised from the ${combo.axis.figma} = ${combo.open} variant and the "${combo.popup.split('/').pop()}" popup${combo.kind === 'combobox' ? ', which holds selectable options' : ', which holds actions (no selected state)'}: the "${combo.field.split('/').pop()}" layer is ${combo.kind === 'combobox' ? 'role="combobox"' : 'a button with aria-haspopup="menu"'} with aria-expanded and aria-controls; a click, Enter, Space or ArrowDown opens it, ArrowDown again moves focus into the popup, Escape closes it. open / defaultOpen / onOpenChange control it; ${combo.axis.prop}="${combo.open}" still opens it for docs and visual tests.`);
    else gaps.push(`Combobox: no ${'"open"'} variant value with a list or menu popup and a field layer (field, input, control or trigger) was found, so no combobox behaviour was generated.`);
    if (combo?.kind === 'combobox') gaps.push('Combobox: typing to filter (autocomplete) is not generated, and choosing an option does not change the value text: connect the popup list to your value in your app.');
  }
  const trig = (() => {
    if (opts.behavior !== 'disclosure' || disclosure) return undefined;
    const bool = booleans.find((b) => /expand|open/i.test(b.p.name));
    const panel = bool ? all.find((l) => l.part.refs?.visible === bool.p.name) : undefined;
    const trigger = panel ? all.find((l) => l.part.type === 'INSTANCE' && l !== panel && !l.path.startsWith(`${panel.path}/`) && l.part.instanceComponentId && ['button', 'action'].includes(opts.lookup?.(l.part.instanceComponentId)?.kind ?? '')) : undefined;
    return bool && panel && trigger ? { bool, prop: bool.prop, panel: panel.path, trigger: trigger.path, defaultOpen: String(bool.p.default) === 'true' } : undefined;
  })();
  if (trig) assumptions.push(`Behaviour from the WAI-ARIA disclosure pattern, recognised from structure: the nested ${trig.trigger.split('/').pop()} button toggles ${trig.prop}, which shows "${trig.panel.split('/').pop()}"; the button gets aria-expanded and aria-controls. ${trig.prop} controls it; defaultExpanded and onExpandedChange make it uncontrolled.`);
  if (unboundSwaps.length) gaps.push(`Instance swap properties not exposed as props (default instance rendered): ${unboundSwaps.map((x) => x.name).join(', ')}.`);
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
  // Nested components. Exposed nested instances (Figma "expose nested instance") make the nested component's
  // props part of this component's API; every other nested prop gets the value Figma gives it in each variant
  // of this component: a constant, a lookup on this component's props, or a pass-through of an exposed prop.
  const packed = opts.behavior === 'radio' || opts.behavior === 'radio-field' || opts.behavior === 'radio-group' || opts.behavior === 'input' || opts.behavior === 'dialog';
  const exposedProps = packed ? [] : exposedApi(set, opts.lookup, [...propAxes.map((a) => a.prop), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop), ...slotList.map((x) => x.prop)]);
  if (packed && exposedApi(set, opts.lookup).length) gaps.push('Exposed nested instance properties are not part of the API for this behaviour template yet.');
  const valueOfAxis = (a: AxisInfo, v: IRVariant) => a.values.find((x) => x.figma === v.values[a.figma])?.value;
  // Variants in their base state: pseudo states and disabled reach nested components through CSS and data attributes.
  const baseVariants = set.variants.filter((v) => axes.every((a) => a.kind !== 'state' || (a.values.find((x) => x.figma === v.values[a.figma])?.role ?? 'base') === 'base'));
  const lookupValue = (lk: VariantLookup, v: IRVariant): string => {
    const val = (p: string) => { if (p === '$checked') return sw ? valueOfAxis(sw.axis, v) : undefined; const a = propAxes.find((x) => x.prop === p); return a ? valueOfAxis(a, v) : undefined; };
    if (lk.override && String(val(lk.override.prop)) === lk.override.value) return lk.override.result;
    return lk.values[String(val(lk.prop))] ?? lk.fallback;
  };
  const nestedProps = new Map<IRPart, InstanceProp[]>();
  const nestedCheck: NestedCheck = { layers: 0, checked: 0, matched: 0, stateVariants: set.variants.length - baseVariants.length, mismatches: [] };
  for (const l of all) {
    const p0 = l.part;
    if (p0.type !== 'INSTANCE' || isIcon(p0) || !p0.instanceComponentId || !opts.lookup) continue;
    const entry = opts.lookup(p0.instanceComponentId);
    if (!entry || !GENERIC_LIKE.has(entry.kind) || entry.set === set) continue;
    // A nested disclosure keeps its own state: Figma's expanded value is its initial state, not a fixed one.
    const nestedOpen = entry.kind === 'disclosure' ? disclosureLayers(entry.set, propPlan(entry.set).axes)?.axis.prop : undefined;
    const api = placedApi(entry, opts.lookup);
    if (!api.length) continue;
    nestedCheck.layers++;
    const placed = [p0, ...(l.copies ?? [])];
    const inVariant = (v: IRVariant) => {
      const xs = v.parts.filter((x) => x.path === l.path && x.type === 'INSTANCE');
      return l.copies?.length ? xs.filter((x) => !x.hidden || x.refs?.visible) : xs;
    };
    const names = new Set(api.map((x) => x.cp.prop));
    placed.forEach((part, k) => {
      const ref = opts.instance(part);
      if (!ref) return;
      const props: InstanceProp[] = ref.props.filter((x) => !names.has(x.prop));
      for (const { cp, read } of api) {
        const pass = p0.exposed && !cp.exposed ? exposedProps.find((e) => e.exposed!.path === l.path && e.exposed!.child.prop === cp.prop) : undefined;
        const rows = baseVariants.flatMap((v) => { const x = inVariant(v)[k]; return x ? [[v, JSON.stringify(read(x))] as const] : []; });
        const own = read(part);
        const fallback = JSON.stringify(own);
        const lk = new Set(rows.map(([, t]) => t)).size > 1 ? lookupBy(rows, fallback) : undefined;
        if (pass) {
          // An exposed property that Figma sets per variant (Amount's suffix=Humanise sets Amount Base to Humanise):
          // by default it follows that variant; a value passed in still wins.
          const type = cp.axis ? cp.tsType(q) : cp.type;
          if (lk && rows.every(([v, t]) => lookupValue(lk, v) === t)) {
            pass.derived = true;
            props.push({ prop: cp.prop, kind: 'expr', value: pass.prop, expr: (r) => `${r(pass.prop)} ?? ${lookupValueExpr(lk, r, type)}`, from: [pass.prop, lk.prop, ...(lk.override ? [lk.override.prop] : [])] });
            for (const [v, t] of rows) { nestedCheck.checked++; if (lookupValue(lk, v) === t) nestedCheck.matched++; else nestedCheck.mismatches.push({ layer: l.path, variant: v.name, prop: cp.prop, code: lookupValue(lk, v), figma: t }); }
          } else props.push({ prop: cp.prop, kind: 'expr', value: pass.prop, expr: (r) => r(pass.prop), from: [pass.prop] });
          continue;
        }
        // A table that maps each value of one of this component's props to the same value is a pass-through.
        const same = lk && !lk.override ? propAxes.find((a) => a.prop === lk.prop) : undefined;
        const identity = Boolean(same && !same.boolean && cp.type === 'string' && same.options.every((o) => (lk!.values[o] ?? lk!.fallback) === JSON.stringify(o) && (!cp.axis || cp.axis.options.includes(o))));
        if (lk && identity) {
          props.push({ prop: cp.prop, kind: 'expr', value: fallback, expr: (r) => r(lk.prop), from: [lk.prop] });
        } else if (lk) {
          const type = cp.axis ? cp.tsType(q) : cp.type;
          props.push({ prop: cp.prop, kind: 'expr', value: fallback, expr: (r) => lookupValueExpr(lk, r, type), from: [lk.prop, ...(lk.override ? [lk.override.prop] : [])] });
        } else if (own !== cp.default) {
          props.push(typeof own === 'boolean' ? { prop: cp.prop, kind: 'boolean', value: own } : { prop: cp.prop, kind: 'string', value: own });
        }
        for (const [v, t] of rows) {
          const got = lk ? lookupValue(lk, v) : fallback;
          nestedCheck.checked++;
          if (got === t) nestedCheck.matched++;
          else nestedCheck.mismatches.push({ layer: l.path, ...(placed.length > 1 ? { copy: k + 1 } : {}), variant: v.name, prop: cp.prop, code: got, figma: t });
        }
      }
      nestedProps.set(part, nestedOpen ? props.map((x) => (x.prop === nestedOpen && x.kind === 'boolean' ? { ...x, prop: 'defaultExpanded' } : x)) : props);
    });
  }
  if (nestedCheck.mismatches.length) {
    gaps.push(`Nested consistency: ${nestedCheck.matched}/${nestedCheck.checked} nested prop values match Figma; ${nestedCheck.mismatches.length} cannot be expressed with this component's props (first: ${nestedCheck.mismatches.slice(0, 3).map((m) => `${m.layer} in ${m.variant}: ${m.prop} ${m.figma}`).join('; ')}).`);
  }
  /** A placed instance with the props this component gives it. */
  const inst = (part: IRPart): InstanceRef | undefined => {
    const r = opts.instance(part);
    const m = nestedProps.get(part);
    return r && m ? { ...r, props: m, attrs: reactAttrs(m, r.text) } : r;
  };
  // Repeated children (phase 2, step 5): copies of one child component that the parent configures. Consumers may pass
  // their own children instead of Figma's examples; the parent fills in what it drives on each (shared values, numbering).
  const repeats = new Map<string, { prop: string; component: string; driven: DrivenProp[]; entry?: RegistryEntry; parts: IRPart[] }>();
  if (slotsEnabled) {
    const taken = new Set<string>([...axes.map((a) => a.prop), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop), ...slotList.map((x) => x.prop), 'disabled', 'className', 'style']);
    for (const l of all) {
      if (l.part.type !== 'INSTANCE' || !l.copies?.length || isIcon(l.part)) continue;
      const parts = [l.part, ...l.copies];
      if (parts.some((x) => x.refs?.visible)) continue; // per-copy visibility (table columns) stays as designed
      const refs = parts.map((x) => inst(x));
      if (refs.some((r) => !r) || new Set(refs.map((r) => r!.component)).size !== 1 || refs[0]!.component === name) continue;
      let prop = !taken.has('children') ? 'children' : camel(`${l.part.name.replace(/[^A-Za-z0-9 _-]+/g, ' ')} items`);
      // Two repeated groups of the same child (a calendar's weeks) would share a name: number the later ones.
      for (let i = 2; prop !== 'children' && taken.has(prop); i++) prop = camel(`${l.part.name.replace(/[^A-Za-z0-9 _-]+/g, ' ')} items ${i}`);
      taken.add(prop);
      const entry = l.part.instanceComponentId && opts.lookup ? opts.lookup(l.part.instanceComponentId) : undefined;
      const defaults = Object.fromEntries((entry ? childApi(entry) : []).filter((cp) => !cp.axis).map((cp) => [cp.prop, cp.default]));
      // The same text on every copy is Figma's example content, not configuration: only numbered text is driven.
      const textProps = new Set((entry ? childApi(entry) : []).filter((cp) => !cp.axis && cp.type === 'string').map((cp) => cp.prop));
      const driven = drivenProps(refs.map((r) => r!.props), defaults).filter((d) => !(d.same && textProps.has(d.prop)));
      repeats.set(l.path, { prop, component: refs[0]!.component, driven, ...(entry ? { entry } : {}), parts });
    }
  }
  const repeatList = [...repeats.entries()].map(([path, r]) => ({ path, prop: r.prop, component: r.component, driven: r.driven }));
  // Collection pack: only for components without another behaviour.
  const collection: Collection | undefined = (() => {
    if (opts.behavior) return undefined;
    const [path, r] = [...repeats.entries()][0] ?? [];
    if (!path || !r?.entry) return undefined;
    const childAxes = propPlan(r.entry.set).axes;
    const sel = childAxes.find((a) => a.boolean && a.kind === 'variant' && /selected|active/i.test(a.figma));
    const chk = childAxes.find((a) => a.boolean && a.kind === 'variant' && /check/i.test(a.figma));
    const on = (prop: string) => r.parts.map((x, k) => (inst(x)?.props.some((y) => y.prop === prop && y.kind === 'boolean' && y.value === true) ? k : -1)).filter((k) => k >= 0);
    const orientation = axes.find((a) => /orientation|direction/i.test(a.figma) && a.options.some((o) => /vertical/.test(o)));
    const labelPath = all.find((l) => !l.path.startsWith(path) && ((l.part.type === 'TEXT' && /label|title|heading|legend/i.test(l.part.refs?.characters ?? l.part.name)) || (l.part.type === 'INSTANCE' && /header|label|legend/i.test(l.part.instanceOf ?? '') && l.part.instanceComponentId && /header|label|legend/i.test(opts.lookup?.(l.part.instanceComponentId)?.set.name ?? ''))))?.path;
    const base = { repeatPath: path, ...(labelPath ? { labelPath } : {}), ...(orientation ? { orientation } : {}) };
    if (r.entry.kind === 'switch' && /radio/i.test(r.component)) return { ...base, role: 'radiogroup', item: 'own-radio', selection: 'single', initial: on('defaultChecked') };
    if (r.entry.kind === 'switch') return { ...base, role: 'group', item: 'own', selection: 'none', initial: [] };
    // "Tabs", "Tab Bar": a whole word, never "Table".
    const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
    if (sel && words.some((x) => x === 'tab' || x === 'tabs')) return { ...base, role: 'tablist', item: 'tab', selection: 'single', stateProp: sel.prop, initial: on(sel.prop) };
    if (chk && r.entry.kind === 'generic') return { ...base, role: 'group', item: 'checkbox', selection: 'multi', stateProp: chk.prop, initial: on(chk.prop) };
    // Listbox and menu: named as a list, menu or options (this set or its item). Figma has no marker for either.
    const itemWords = r.component.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
    const listWords = ['list', 'listbox', 'options', 'option', 'dropdown', 'select', 'menu'];
    if (r.entry.kind !== 'generic' || ![...words, ...itemWords].some((x) => listWords.includes(x))) return undefined;
    const variantOf = (x: IRPart) => r.entry!.set.variants.find((v) => v.nodeId === x.instanceComponentId)?.values ?? {};
    const kindAxis = childAxes.find((a) => !a.boolean && a.options.length > 1 && a.options.some((o) => /separator|divider|heading|header|title/.test(o)));
    const kindOfValue = (v: string): ItemKind => (/separator|divider/.test(v) ? 'separator' : /heading|header|title/.test(v) ? 'heading' : 'item');
    const kinds = kindAxis ? { prop: kindAxis.prop, separator: kindAxis.options.filter((o) => kindOfValue(o) === 'separator'), heading: kindAxis.options.filter((o) => kindOfValue(o) === 'heading'), copies: r.parts.map((x) => kindOfValue(kebab(variantOf(x)[kindAxis.figma] ?? kindAxis.defaultValue))) } : undefined;
    // Variants that show none of the items (Loading, Empty): which values of one axis they are.
    const empty = set.variants.filter((v) => !v.parts.some((x) => x.path === path && !x.hidden));
    const hiddenAxis = empty.length && empty.length < set.variants.length ? axes.find((a) => { const vals = new Set(empty.map((v) => v.values[a.figma])); return set.variants.every((v) => vals.has(v.values[a.figma]) === empty.includes(v)); }) : undefined;
    const hiddenWhen = hiddenAxis ? { prop: hiddenAxis.prop, values: [...new Set(empty.map((v) => (hiddenAxis.boolean ? String(/^true$/i.test(v.values[hiddenAxis.figma] ?? '')) : kebab(v.values[hiddenAxis.figma] ?? ''))))] } : undefined;
    const label = { defaultLabel: humanize(set.name.replace(/^[_.\s]+/, '').replace(/([a-z])([A-Z])/g, '$1 $2')), ...(hiddenWhen ? { hiddenWhen } : {}) };
    if (sel) {
      // The set can switch between one and several selected options (Selection Type = Single / Multi).
      const multiAxis = axes.find((a) => !a.boolean && /select|type|mode/i.test(a.figma) && a.options.some((o) => /multi/.test(o)));
      const multiValue = multiAxis?.options.find((o) => /multi/.test(o));
      const multiple = multiAxis && multiValue ? { prop: multiAxis.prop, value: multiValue } : undefined;
      const copySelected = r.parts.map((x) => {
        const v = inst(x)?.props.find((y) => y.prop === sel.prop);
        return (ref: (prop: string) => string) => (v?.kind === 'expr' ? v.expr(ref) : String(v?.kind === 'boolean' && v.value === true));
      });
      return { ...base, ...label, role: 'listbox', item: 'option', selection: 'multi', stateProp: sel.prop, initial: on(sel.prop), ...(multiple ? { multiple } : {}), copySelected, ...(kinds ? { kinds } : {}) };
    }
    if (!sel && !chk && [...words, ...itemWords].includes('menu')) return { ...base, ...label, role: 'menu', item: 'menuitem', selection: 'none', initial: [], ...(kinds ? { kinds } : {}) };
    return undefined;
  })();
  if (collection) assumptions.push(collection.role === 'tablist'
    ? `Behaviour from the WAI-ARIA tabs pattern, recognised from the items' ${collection.stateProp} axis: role="tablist" with tabs that have aria-selected; one tab is focusable, arrow keys (and Home, End) move the selection. selected / defaultSelected / onSelectedChange control it. Figma has no tab panels: connect them with aria-controls in your app.`
    : collection.role === 'radiogroup'
      ? 'Behaviour from the WAI-ARIA radio group pattern: role="radiogroup"; the group selects one radio, only the selected one is focusable, and arrow keys move the selection. selected / defaultSelected / onSelectedChange control it.'
      : collection.item === 'checkbox'
        ? `Behaviour from the WAI-ARIA checkbox pattern for each item, recognised from the items' ${collection.stateProp} axis: role="group" with checkbox items (Space or Enter toggles one). selected / defaultSelected / onSelectedChange hold the selected indexes.`
        : collection.role === 'listbox'
          ? `Behaviour from the WAI-ARIA listbox pattern, recognised from the items' ${collection.stateProp} axis and the name: role="listbox" with option items and aria-selected. One tab stop; arrow keys, Home and End move the active option (aria-activedescendant, shown with the Figma focus style); Enter, Space or a click selects. ${collection.multiple ? `Several options can be selected when ${collection.multiple.prop} is "${collection.multiple.value}". ` : ''}${collection.kinds ? 'Separators are hidden from assistive technology and section headings are plain text (they do not group options). ' : ''}selected / defaultSelected / onSelectedChange hold the selected indexes; until then each option shows the selection Figma gives it.`
          : collection.role === 'menu'
            ? 'Behaviour from the WAI-ARIA menu pattern, recognised from the name: role="menu" with menuitem items. One tab stop; arrow keys, Home and End move the active item; Enter or Space activates it (a click). Opening and closing the menu belongs to its trigger.'
            : 'role="group" around items that have their own behaviour.');
  if (collection && !collection.labelPath && !collection.defaultLabel) gaps.push(`${name}: no label layer found for the group; name it with aria-label or aria-labelledby.`);
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
  /**
   * Layers inside nested components that a variant restyles (Figma instance overrides): Blade's Amount sets the size
   * of Amount Base's digits per variant. Each becomes a role that sets only the overridden properties.
   */
  function innerRoles(): RoleDef[] {
    const out: RoleDef[] = [];
    for (const l of all) {
      if (l.part.type !== 'INSTANCE' || isIcon(l.part) || !l.part.instanceComponentId) continue;
      const entry = opts.lookup?.(l.part.instanceComponentId);
      if (!entry || entry.component === name) continue;
      const restyled = new Map<string, Set<string>>();
      for (const v of set!.variants) for (const x of partIn(v, l.path)?.inner ?? []) restyled.set(x.path, new Set([...(restyled.get(x.path) ?? []), ...x.fields]));
      if (!restyled.size) continue;
      const childDefault = defaultVariantOf(entry.set);
      const childRoles = new Map((childDefault ? layers(entry.set, childDefault) : []).map((c) => [c.path, c]));
      for (const [path, fields] of restyled) {
        const child = childRoles.get(path);
        if (!child) continue;
        const text = child.part.type === 'TEXT';
        const props = [...new Set([...fields].flatMap((f) => INNER_PROPS(f, text)))];
        if (!props.length) continue;
        out.push({
          role: `${l.role}__${child.role}`,
          kind: 'node',
          display: text ? 'block' : child.part.style.layoutMode ? 'flex' : 'block',
          parent: l.role,
          inner: { host: l.role, layer: child.role, props },
          find: (v): Found | undefined => {
            const x = partIn(v, l.path)?.inner?.find((i) => i.path === path);
            return x ? { style: x.style, part: { path, parent: '', name: path, type: x.type, style: x.style, ...(x.hidden ? { hidden: true } : {}) } } : undefined;
          },
        });
      }
    }
    return out;
  }
  /** Nested components placed over the layout (a focus ring): Figma stretches them with constraints, so they fill their box. */
  function overlayFill(): string {
    const over = all.filter((l) => l.part.type === 'INSTANCE' && !isIcon(l.part) && l.part.instanceComponentId && inst(l.part) && set!.variants.some((v) => {
      const p = partIn(v, l.path);
      const parent = l.parent ? partIn(v, l.parent)?.style : v.style;
      return p && !p.hidden && (p.style.absolute || !parent?.layoutMode);
    }));
    return over.map((l) => `\n.root .${l.role} > *, .root .${l.role} ::part(root) {\n  height: 100%;\n  width: 100%;\n}\n`).join('');
  }
  const roles: RoleDef[] = [
    { role: 'root', kind: 'node', display: rootDisplay, find: (v): Found => ({ style: v.style }) },
    ...all.map<RoleDef>((l) => {
      const bound = Boolean(l.part.refs?.visible && boolFor(l.part.refs.visible));
      const nestedComponent = l.part.type === 'INSTANCE' && !isIcon(l.part) && Boolean(l.part.instanceComponentId && inst(l.part));
      const display = nestedComponent || l.part.style.layoutMode ? 'flex' : isIcon(l.part) ? 'inline-flex' : l.part.type === 'TEXT' ? 'block' : 'block';
      return {
        role: l.role,
        kind: 'node',
        display,
        ...(nestedComponent ? { layoutOnly: true } : {}),
        ...(SHAPES.has(l.part.type) && all.some((c) => c.parent === l.path && c.part.type === 'INSTANCE') ? { shapeGroup: true } : {}),
        ...(isIcon(l.part) && SHAPES.has(byPath.get(l.parent)?.part.type ?? '') ? { inheritColor: true } : {}),
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
    ...innerRoles(),
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
  const kindOf = (l: LayerInfo) => (l.part.type === 'INSTANCE' && !isIcon(l.part) && l.part.instanceComponentId ? inst(l.part)?.kind : undefined);
  const controlLayer = radio?.kind === 'field' ? all.find((l) => kindOf(l) === 'radio') : undefined;
  const rowPath = controlLayer?.parent;
  const labelLayer = controlLayer ? all.find((l) => l.parent === rowPath && l.part.type === 'TEXT') ?? all.find((l) => l.part.type === 'TEXT') : undefined;
  const itemsLayer = radio?.kind === 'group' ? all.find((l) => l.part.type !== 'TEXT' && l.part.type !== 'INSTANCE' && all.some((c) => c.parent === l.path && kindOf(c) === 'radio-field')) : undefined;
  const groupLabelLayer = radio?.kind === 'group' ? all.find((l) => l.parent === '' && l.part.type === 'TEXT') : undefined;
  if (radio?.kind === 'field' && !controlLayer) gaps.push('Radio field: no nested radio control found, so the label is not linked to a radio.');
  if (radio?.kind === 'group' && !itemsLayer) gaps.push('Radio group: no layer holding radio fields found; children render at the end.');
  if (radio?.kind === 'group' && !radio.control) gaps.push('Radio group: no generated radio control found, so the group cannot share its name and value through context.');
  if (radio) radio.copy = (labelLayer ?? groupLabelLayer)?.part.text ?? undefined;
  const controlName = controlLayer ? inst(controlLayer.part)?.component : undefined;
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
  let usesRepeat = false;
  const children = (parent: string) => all.filter((l) => l.parent === parent);
  const inHeader = (l: LayerInfo): boolean => Boolean(disclosure) && (l.path === disclosure!.header || (l.parent !== '' && byPath.has(l.parent) && inHeader(byPath.get(l.parent)!)));
  /** The control inside a disclosure header, if any: it becomes the trigger instead of a new button around it. */
  let disTriggerMemo: LayerInfo | null | undefined;
  const disTrigger = (): LayerInfo | undefined => {
    if (disTriggerMemo === undefined) disTriggerMemo = (disclosure && all.find((x) => x.path.startsWith(`${disclosure.header}/`) && x.part.type === 'INSTANCE' && !isIcon(x.part) && INTERACTIVE_KINDS.has(inst(x.part)?.kind ?? ''))) || null;
    return disTriggerMemo ?? undefined;
  };
  const render = (l: LayerInfo, indent: string): string => {
    const p = l.part;
    // data-layer: a stable hook on every layer, so a component that places this one can restyle a layer as Figma does.
    const cls = `className={styles.${l.role}} data-layer="${l.role}"`;
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
      const nested = !isIcon(p) && p.instanceComponentId ? inst(p) : undefined;
      const slotted = (inner: string, hidden = false) => `<span ${cls}${hidden ? ' aria-hidden="true"' : ''}>{${l.slot!.prop} ?? ${inner ? `(${inner})` : 'null'}}</span>`;
      if (icon) {
        usesIcon = true;
        const glyph = l.iconByAxis ? `<Icon name={${lookupExpr(l.iconByAxis, reactRef, 'IconName')}} />` : `<Icon name="${icon.name}" />`;
        el = l.slot ? slotted(glyph, true) : `<span ${cls} aria-hidden="true">${glyph}</span>`;
      } else if (nested && nested.component !== name && l.slot) {
        imports.add(`import { ${nested.component} } from '${nested.importPath}';`);
        if (nested.usesIcon) usesIcon = true;
        gaps.push(...nested.notes);
        el = slotted(`<${nested.component}${nested.attrs.length ? ' ' + nested.attrs.join(' ') : ''} />`);
      } else if (l.slot) {
        el = slotted('');
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
          const all2 = [[p, nested] as const, ...l.copies.map((c) => [c, inst(c)] as const)].filter((x): x is readonly [IRPart, InstanceRef] => Boolean(x[1]));
          const rp = repeats.get(l.path);
          if (rp) {
            usesRepeat = true;
            const value = (d: DrivenProp) => {
              if (d.numbered) return `\`${d.numbered.prefix}\${i + ${d.numbered.start}}${d.numbered.suffix}\``;
              const x = d.same!;
              if (x.kind === 'icon') { usesIcon = true; return `<Icon name="${x.value}" />`; }
              return x.kind === 'expr' ? x.expr(reactRef) : JSON.stringify(x.value);
            };
            const driven = `{ ${rp.driven.map((d) => `${JSON.stringify(d.prop)}: ${value(d)}`).join(', ')} }`;
            const items = collection?.repeatPath === l.path && collection.item !== 'own';
            const lc = listy(collection) ? collection : undefined;
            const args = (k: number) => (lc ? `${k}, ${lc.copySelected?.[k]?.(reactRef) ?? 'false'}, ${JSON.stringify(lc.kinds?.copies[k] ?? 'item')}` : String(k));
            const own = (k: number, x: string) => (items ? x.replace(/ \/><\/span>$/, ` {...(itemProps(${args(k)}) as object)} /></span>`) : x);
            const childArgs = lc ? `i, (child.props as { ${lc.stateProp ?? 'selected'}?: boolean }).${lc.stateProp ?? 'selected'}, ${lc.kinds ? `kindOf((child.props as { ${lc.kinds.prop}?: string }).${lc.kinds.prop})` : "'item'"}` : 'i';
            return `${indent}{${rp.prop} !== undefined\n${indent}  ? Children.map(${rp.prop}, (child, i) => <span ${cls} key={i}>{isValidElement(child) && child.type === ${rp.component} ? cloneElement(child, { ...${driven}, ...(child.props as object)${items ? `, ...(itemProps(${childArgs}) as object)` : ''} }) : child}</span>)\n${indent}  : (\n${indent}    <>\n${all2.map(([part, n], k) => `${indent}      ${guard(part, own(k, one(n)))}`).join('\n')}\n${indent}    </>\n${indent}  )}`;
          }
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
      if (!set.variants.some((v) => v.parts.some((x) => x.path === p.path && x.shape))) gaps.push(`Layer "${p.path}" is a ${p.type.toLowerCase()} shape; approximated with its fill and size (no vector path).`);
      el = `<span ${cls} aria-hidden="true" />`;
    } else {
      const kids = children(l.path);
      const box = l.path === rowPath ? 'label' : sw || radio?.kind === 'control' || inHeader(l) || rootTag !== 'div' ? 'span' : 'div'; // a <button> or <a> may only hold phrasing content
      const inner = kids.map((k) => render(k, indent + '  ')).join('\n');
      if (disclosure && l.path === disclosure.header && !disTrigger()) {
        const open = disclosure.axis.prop;
        const b0 = boolFor(p.refs?.visible);
        const btn = `<button type="button" ${cls} aria-expanded={${open}} aria-controls={panelId} onClick={toggleExpanded}${hasDisabled ? ' disabled={disabled}' : ''}>\n${inner}\n${indent}</button>`;
        return b0 ? `${indent}{${b0} && (\n${indent}  ${btn.replace(/\n/g, `\n  `)}\n${indent})}` : `${indent}${btn}`;
      }
      const slotted = l === itemsLayer ? 'children' : dialog && l.role === dialog.body ? 'children' : dialog && l.role === dialog.footer ? 'footer' : undefined;
      const idAttr = dialog && l.role === dialog.body ? ' id={bodyId}' : disclosure && l.path === disclosure.panel ? ' id={panelId}' : '';
      el = slotted
        ? `<${box} ${cls}${idAttr}>\n${indent}  {${slotted} ?? (\n${indent}    <>\n${kids.map((k) => render(k, indent + '      ')).join('\n')}\n${indent}    </>\n${indent}  )}\n${indent}</${box}>`
        : l === itemsLayer
        ? `<${box} ${cls}>\n${indent}  {children ?? (\n${indent}    <>\n${kids.map((k) => render(k, indent + '      ')).join('\n')}\n${indent}    </>\n${indent}  )}\n${indent}</${box}>`
        : kids.length ? `<${box} ${cls}${idAttr}>\n${inner}\n${indent}</${box}>` : `<${box} ${cls}${idAttr} />`;
    }
    if (collection?.labelPath === l.path) el = el.replace(/^<(\w+) /, '<$1 id={labelId} ');
    if (trig?.panel === l.path) el = el.replace(/^<(\w+) /, '<$1 id={panelId} ');
    if (combo?.field === l.path) el = el.replace(/^<(\w+) /, '<$1 {...comboboxProps} ');
    if (combo?.popup === l.path) el = el.replace(/^<(\w+) /, '<$1 id={popupId} ');
    if (combo?.label === l.path) el = el.replace(/^<(\w+) /, '<$1 id={labelId} ');
    // The trigger may be a plain nested button or the default of a slot (an instance swap): add the attributes to its tag.
    // A disclosure whose header holds a control: that control is the trigger (no button around a button).
    if (disclosure && disTrigger()?.path === l.path) el = el.replace(/ \/>(\)\})?<\/span>$/, (_m, slot: string | undefined) => ` aria-expanded={${disclosure.axis.prop}} aria-controls={panelId} onClick={toggleExpanded} />${slot ?? ''}</span>`);
    if (trig?.trigger === l.path) el = el.replace(/ \/>(\)\})?<\/span>$/, (_m, slot: string | undefined) => ` aria-expanded={${trig.prop}} aria-controls={${trig.prop} ? panelId : undefined} onClick={toggleExpanded} />${slot ?? ''}</span>`);
    const b = boolFor(p.refs?.visible);
    return b ? `${indent}{${b} && (\n${indent}  ${el.replace(/\n/g, `\n  `)}\n${indent})}` : `${indent}${el}`;
  };
  const body = children('').map((l) => render(l, '      ')).join('\n');

  if (set.variants.length < axes.reduce((n, a) => n * a.values.length, 1)) {
    assumptions.push(`The Figma set has ${set.variants.length} of ${axes.reduce((n, a) => n * a.values.length, 1)} possible variant combinations; other combinations use the nearest defined styles.`);
  }
  const figmaFocus = axes.some((a) => a.values.some((v) => v.state === 'focus'));
  if (sw && !figmaFocus) assumptions.push(`Figma has no focus state; a 2px focus ring (${sw.focusColor}) is added for keyboard users.`);
  if (sw && !texts.length) gaps.push(`Figma has no label for ${name}: give each one an accessible name with aria-label or aria-labelledby.`);
  if (!sw && figmaFocus) {
    assumptions.push('A focus style exists in Figma, but the generic element is not focusable; it shows only when forced (data-force-state="focus") until behaviour is specified.');
  }

  const propLines = [
    ...(sw ? [
      `  /** On or off (controlled). Figma: ${sw.axis.figma}. */\n  checked?: boolean;`,
      '  /** Initial state when uncontrolled. Default false. */\n  defaultChecked?: boolean;',
      `  /** Called with the new state when the user toggles the ${sw.role}. */\n  onCheckedChange?: (checked: boolean) => void;`,
    ] : []),
    ...propAxes.map((a) => `  /** ${a.description ? `${a.description} ` : ''}Figma: ${a.figma}. ${responsive.has(a) ? 'Not set: follows the viewport.' : `Default ${a.defaultValue}.`}${a === sw?.busy ? ' "loading" sets aria-busy and blocks toggling.' : ''} */\n  ${a.prop}?: ${axisType(a, q)};`),
    ...(hasDisabled ? ['  /** Figma: State=Disabled. */\n  disabled?: boolean;'] : []),
    ...booleans.map((b) => `  /** ${b.description ? `${b.description} ` : ''}Figma: ${b.p.name} (boolean). Default ${b.p.default}. */\n  ${b.prop}?: boolean;`),
    ...texts.map((t) => `  /** ${t.description ? `${t.description} ` : ''}Figma: ${t.p.name} (text). */\n  ${t.prop}?: ReactNode;`),
    ...exposedProps.map((e) => `  /** Figma: ${e.exposed!.name} › ${e.figma} (exposed nested instance). Default ${e.derived ? 'follows the variant, as in Figma' : String(e.default)}. */\n  ${e.prop}?: ${e.tsType(q)};`),
    ...repeatList.map((r) => `  /** Your own ${r.component} items instead of the Figma examples. ${name} sets ${r.driven.length ? r.driven.map((d) => d.prop).join(', ') : 'nothing'} on each one you do not set yourself${r.driven.some((d) => d.numbered) ? ' (numbered by position)' : ''}. */\n  ${r.prop}?: ReactNode;`),
    ...slotList.map((x) => `  /** ${x.description ? `${x.description} ` : ''}${x.toggle ? `Content for the "${x.figma}" slot, shown by Figma's "${x.toggle.figma}" boolean: pass content to show it, null to hide it. Not set: ${x.toggle.default ? 'shown with the Figma default' : 'hidden'}, as in Figma.` : `Content for ${x.kind === 'swap' ? `the "${x.figma}" slot (Figma instance swap)` : `the "${x.figma}" placeholder`}; the Figma default when not set.`} */\n  ${x.prop}?: ReactNode;`),
    ...(collection?.item === 'option' ? [
      '  /** Indexes of the selected options (controlled). */\n  selected?: number[];',
      '  /** Initial selection when selected is not set. Not set: each option keeps the selection Figma gives it. */\n  defaultSelected?: number[];',
      '  /** Called with the selected indexes when the user selects an option. */\n  onSelectedChange?: (indexes: number[]) => void;',
    ] : []),
    ...(collection && collection.selection !== 'none' && !listy(collection) ? (collection.selection === 'single' ? [
      '  /** Index of the selected item (controlled). */\n  selected?: number;',
      `  /** Initial selection when selected is not set. Default ${collection.initial[0] ?? 'none'} (Figma). */\n  defaultSelected?: number;`,
      '  /** Called with the index the user selects. */\n  onSelectedChange?: (index: number) => void;',
    ] : [
      '  /** Indexes of the selected items (controlled). */\n  selected?: number[];',
      `  /** Initial selection when selected is not set. Default [${collection.initial.join(', ')}] (Figma). */\n  defaultSelected?: number[];`,
      '  /** Called with the selected indexes when the user toggles an item. */\n  onSelectedChange?: (indexes: number[]) => void;',
    ]) : []),
    ...(combo ? [
      '  /** Whether the popup is open (controlled). */\n  open?: boolean;',
      `  /** Initial state when open is not set. Default: ${combo.axis.prop} is "${combo.open}". */\n  defaultOpen?: boolean;`,
      '  /** Called with the new state when the user opens or closes the popup. */\n  onOpenChange?: (open: boolean) => void;',
    ] : []),
    ...(trig ? [
      `  /** Initial state when ${trig.prop} is not set (uncontrolled). Default ${trig.defaultOpen}. */\n  defaultExpanded?: boolean;`,
      '  /** Called with the new state when the user toggles it. */\n  onExpandedChange?: (expanded: boolean) => void;',
    ] : []),
    ...(disclosure ? [
      `  /** Initial state when ${disclosure.axis.prop} is not set (uncontrolled). Default ${disclosure.axis.defaultValue}. */\n  defaultExpanded?: boolean;`,
      '  /** Called with the new state when the user toggles it. */\n  onExpandedChange?: (expanded: boolean) => void;',
    ] : []),
    `  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */\n  'data-force-state'?: string;`,
  ];
  const ownProps = [...(sw ? ['checked', 'defaultChecked', 'value', 'onChange'] : []), ...propAxes.map((a) => a.prop), ...(hasDisabled ? ['disabled'] : []), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop), ...exposedProps.map((e) => e.prop), ...slotList.map((x) => x.prop), ...repeatList.map((r) => r.prop), ...(collection && collection.selection !== 'none' ? ['selected', 'defaultSelected', 'onSelectedChange'] : []), ...(trig ? ['defaultExpanded', 'onExpandedChange'] : []), ...(disclosure ? ['defaultExpanded', 'onExpandedChange'] : []), ...(combo ? ['open', 'defaultOpen', 'onOpenChange'] : [])];
  const destructure = [
    ...(sw ? ['checked', 'defaultChecked = false', 'onCheckedChange', 'onClick', ...(sw.role !== 'switch' ? ['onKeyDown'] : [])] : []),
    ...propAxes.map((a) => (a === disclosure?.axis ? `${a.prop}: ${a.prop}Prop` : a === combo?.axis ? `${a.prop}: ${a.prop}Prop = ${axisDefault(a, q)}` : responsive.has(a) ? a.prop : `${a.prop} = ${axisDefault(a, q)}`)),
    ...(combo ? ['open', 'defaultOpen', 'onOpenChange', 'onKeyDown', "'aria-label': ariaLabel"] : []),
    ...(disclosure ? [`defaultExpanded = ${disclosure.axis.defaultValue === 'true'}`, 'onExpandedChange'] : []),
    ...(hasDisabled ? ['disabled = false'] : []),
    ...booleans.map((b) => (b === trig?.bool ? `${b.prop}: ${b.prop}Prop` : `${b.prop} = ${String(b.p.default) === 'true'}`)),
    ...(trig ? [`defaultExpanded = ${trig.defaultOpen}`, 'onExpandedChange'] : []),
    ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`),
    ...exposedProps.map((e) => (e.derived ? e.prop : `${e.prop} = ${(e.axis ? axisLiteral(e.axis, String(e.default), q) : typeof e.default === 'boolean' ? String(e.default) : q(String(e.default)))}`)),
    ...slotList.map((x) => x.prop),
    ...repeatList.map((r) => r.prop),
    ...(collection?.item === 'option' ? ['selected', 'defaultSelected', 'onSelectedChange'] : []),
    ...(listy(collection) ? ['onKeyDown'] : []),
    ...(collection && collection.selection !== 'none' && !listy(collection) ? ['selected', `defaultSelected = ${collection.selection === 'single' ? (collection.initial[0] ?? -1) : `[${collection.initial.join(', ')}]`}`, 'onSelectedChange', 'onKeyDown'] : []),
    'className',
    '...rest',
  ];
  const dataAttrs = [
    // A link without href has no link role, and ARIA does not allow a name on it: only a real link is named.
    ...(nameFrom ? [`aria-label={typeof ${nameFrom} === 'string'${rootTag === 'a' ? ' && rest.href !== undefined' : ''} ? ${nameFrom} : undefined}`] : []),
    ...(sw ? [`data-${sw.axis.attr}={on ? ${q(sw.on)} : ${q(sw.off)}}`] : []),
    ...propAxes.map((a) => (responsive.has(a) ? `data-${a.attr}={${a.prop} ?? 'responsive'}` : `data-${a.attr}={${axisData(a, a.prop)}}`)),
    ...(hasDisabled ? ["data-disabled={disabled ? '' : undefined}", sw || rootTag === 'button' ? 'disabled={disabled}' : 'aria-disabled={disabled || undefined}'] : []),
    ...(sw?.busy ? ['aria-busy={busy || undefined}'] : []),
    ...(busyAxis ? [`aria-busy={${busyAxis.prop} || undefined}`] : []),
    ...(collection && !listy(collection) ? [`role="${collection.role}"`, ...(collection.labelPath ? ['aria-labelledby={labelId}'] : []), ...(collection.orientation && collection.role !== 'group' ? [`aria-orientation={${collection.orientation.prop} === 'vertical' ? 'vertical' : 'horizontal'}`] : [])] : []),
    ...(collection?.selection === 'single' ? ['onKeyDown={moveSelection}'] : []),
    ...(combo ? ['onKeyDown={closeOnEscape}'] : []),
    ...(listy(collection) ? ['{...listProps}'] : []),
  ];

  const exposedNode = exposedProps.some((e) => !e.axis && e.type === 'string');
  const rootAttrs = rootTag === 'button' ? 'ButtonHTMLAttributes' : rootTag === 'a' ? 'AnchorHTMLAttributes' : 'HTMLAttributes';
  const rootElement = rootTag === 'button' ? 'HTMLButtonElement' : rootTag === 'a' ? 'HTMLAnchorElement' : 'HTMLDivElement';
  const radioTsx = radio ? radioComponent() : input ? inputComponent() : dialog ? dialogComponent() : undefined;
  const tsx = radioTsx ?? (sw ? `// Generated by ds-sync (switch template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
// Visuals come from Figma. Behaviour: WAI-ARIA ${sw.role} pattern (native button, role="${sw.role}", aria-checked).
import { useState, type ButtonHTMLAttributes${texts.length || exposedNode || slotList.length || repeatList.length ? ', type ReactNode' : ''} } from 'react';

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
      role="${sw.role}"
      aria-checked={${sw.mixed ? `${sw.mixed.prop} ? 'mixed' : on` : 'on'}}${sw.role !== 'switch' ? `
      onKeyDown={(event) => {
        onKeyDown?.(event);
        // The ${sw.role} pattern toggles with Space only; a native button would also toggle on Enter.
        if (event.key === 'Enter') event.preventDefault();
      }}` : ''}
      className={[styles.root, className].filter(Boolean).join(' ')}
      ${dataAttrs.join('\n      ')}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented${sw.busy ? ' || busy' : ''}) return;
        ${sw.role === 'radio' ? 'if (on) return;\n        ' : ''}if (checked === undefined) setInner(!on);
        onCheckedChange?.(!on);
      }}
    >
${body}
    </button>
  );
}
` : `// Generated by ds-sync (generic template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
// Visuals come from Figma. ${behaviourLine(packName({ combo, collection, disclosure: Boolean(disclosure || trig), rootTag }))}
${disclosure || trig || combo ? `import { useId, useState, type ${rootAttrs}${combo ? ', type KeyboardEvent' : ''}${texts.length || exposedNode || slotList.length || repeatList.length ? ', type ReactNode' : ''} } from 'react';` : `import type { ${rootAttrs}${texts.length || exposedNode || slotList.length || repeatList.length ? ', ReactNode' : ''}${collection && (collection.selection !== 'none' || listy(collection)) ? ', KeyboardEvent' : ''} } from 'react';`}

${usesRepeat ? `import { Children, cloneElement, isValidElement${collection ? ', useId' : ''}${collection && (collection.selection !== 'none' || listy(collection)) ? ', useState' : ''} } from 'react';\n` : ''}${usesIcon ? `import { Icon } from '../../icons/Icon';\n` : ''}${all.some((l) => l.iconByAxis) ? `import type { IconName } from '../../icons/icons';\n` : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import styles from './${name}.module.css';

export interface ${name}Props extends Omit<${rootAttrs}<${rootElement}>, 'children'${ownProps.filter((p) => p !== 'children').map((p) => ` | '${p}'`).join('')}> {
${propLines.join('\n')}
}

export function ${name}({ ${destructure.join(', ')} }: ${name}Props) {
${collection ? collectionBody(collection) : ''}${combo ? comboBody(combo, hasDisabled) : ''}${trig ? `  const [innerExpanded, setInnerExpanded] = useState(defaultExpanded);
  const ${trig.prop} = ${trig.prop}Prop ?? innerExpanded;
  const panelId = useId();
  const toggleExpanded = () => {
    if (${trig.prop}Prop === undefined) setInnerExpanded(!${trig.prop});
    onExpandedChange?.(!${trig.prop});
  };
` : ''}${disclosure ? `  const [innerExpanded, setInnerExpanded] = useState(defaultExpanded);
  const ${disclosure.axis.prop} = ${disclosure.axis.prop}Prop ?? innerExpanded;
  const panelId = useId();
  const toggleExpanded = () => {
    if (${disclosure.axis.prop}Prop === undefined) setInnerExpanded(!${disclosure.axis.prop});
    onExpandedChange?.(!${disclosure.axis.prop});
  };
` : ''}  return (
    <${rootTag}${rootTag === 'button' ? ' type="button"' : ''} className={[styles.root, className].filter(Boolean).join(' ')}${dataAttrs.length ? ' ' + dataAttrs.join(' ') : ''} {...rest}>
${body}
    </${rootTag}>
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
    const destructure = [...propAxes.map((a) => (responsive.has(a) ? a.prop : `${a.prop} = ${axisDefault(a, q)}`)), ...booleans.map((b) => `${b.prop} = ${String(b.p.default) === 'true'}`), ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`), 'open', 'defaultOpen = false', 'modal = true', 'onOpenChange', ...(d.body ? ['children'] : []), ...(d.footer ? ['footer'] : []), 'className', 'onClose', 'onKeyDown', '...rest'];
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
      ${propAxes.map((a) => (responsive.has(a) ? `data-${a.attr}={${a.prop} ?? 'responsive'}` : `data-${a.attr}={${axisData(a, a.prop)}}`)).join('\n      ')}
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
    const destructure = [...propAxes.map((a) => (responsive.has(a) ? a.prop : `${a.prop} = ${axisDefault(a, q)}`)), 'disabled = false', ...booleans.map((b) => `${b.prop} = ${String(b.p.default) === 'true'}`), ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`), 'invalid: invalidProp', ...(ip.clear ? ['onClear'] : []), 'id', 'className', 'style', 'value', 'defaultValue', 'maxLength', 'onChange', "'aria-describedby': ariaDescribedBy", "'data-force-state': forceState", '...rest'];
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
    <div className={[styles.root, className].filter(Boolean).join(' ')} style={style} ${[...propAxes.map((a) => (responsive.has(a) ? `data-${a.attr}={${a.prop} ?? 'responsive'}` : `data-${a.attr}={${axisData(a, a.prop)}}`)), "data-disabled={disabled ? '' : undefined}", "data-invalid={invalid ? '' : undefined}", 'data-force-state={forceState}'].join(' ')}>
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
    const axisProps = propAxes.map((a) => (responsive.has(a) ? a.prop : `${a.prop} = ${axisDefault(a, q)}`));
    const dataOfAxes = propAxes.map((a) => (responsive.has(a) ? `data-${a.attr}={${a.prop} ?? 'responsive'}` : `data-${a.attr}={${axisData(a, a.prop)}}`));
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

  let css = `/* Generated by ds-sync (generic template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand. */
.root { box-sizing: border-box; position: relative; }
${all.map((l) => `.${l.role}`).join(', ')}${all.length ? ' { box-sizing: border-box; position: relative; margin: 0; min-width: 0; }' : ''}
${rootTag !== 'div' ? `
/* Native ${rootTag === 'a' ? 'link' : 'button'} reset (zero specificity, so the Figma styles below win). */
:where(.root) { appearance: none; border: 0; padding: 0; margin: 0; background: none; font: inherit; color: inherit; text-align: inherit; text-decoration: none; cursor: pointer; }
:where(.root):disabled, :where(.root)[aria-disabled="true"] { cursor: not-allowed; }
${axes.some((a) => a.values.some((v) => v.state === 'focus')) ? '' : `.root:focus-visible, .root[data-force-state~="focus"] { outline: 2px solid ${ctx.resolver.byName(/(^|\/)(border\/)?(interactive\/)?focus(ed)?$/) ?? 'currentColor'}; outline-offset: 2px; }\n`}` : ''}${disclosure ? `
/* Disclosure header: native button reset (zero specificity, so the Figma styles below win) and a keyboard focus ring. */
:where(button.${byPath.get(disclosure.header)!.role}) { appearance: none; border: 0; padding: 0; margin: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; width: 100%; }
button.${byPath.get(disclosure.header)!.role}:focus-visible { outline: 2px solid ${ctx.resolver.byName(/(^|\/)(border\/)?(interactive\/)?focus(ed)?$/) ?? 'currentColor'}; outline-offset: 2px; }
` : ''}${sw ? `
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
${styles.css}${overlayFill()}`;

  // Stories
  // Internal Figma properties (a decision): kept at their Figma default, not shown as API in stories or controls.
  const internal = (figma: string) => decidedInternal(set, figma);
  const multi = axes.filter((a) => a.values.length > 1 && !internal(a.figma));
  const stateAxis = multi.find((a) => a.kind === 'state');
  const rowAxis = multi.find((a) => a !== stateAxis);
  const colAxis = stateAxis ?? multi.find((a) => a !== rowAxis);
  const storyNames = new Set(['Default']);
  // Story exports must not shadow the component, its imports or JavaScript / DOM globals (Error, Image, Range...).
  const TAKEN = new Set([name, `${name}Props`, 'Meta', 'StoryObj', 'Story', 'Labelled', 'Matrix', 'Row', 'Icon', 'expect', 'fn', 'userEvent', 'within', 'useState', 'Error', 'Map', 'Set', 'Date', 'Image', 'Option', 'Range', 'File', 'Text', 'Node', 'Element', 'Event', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'Promise', 'JSON', 'Math', 'Intl', 'Proxy', 'Reflect', 'URL', 'Request', 'Response', 'Headers', 'Audio', 'Selection', 'Location', 'History', 'Navigator', 'Storage', 'Window', 'Document', 'Function', 'RegExp', 'Infinity', 'NaN']);
  const storyName = (s: string) => {
    let n = pascal(s) || 'Axis';
    if (/^[0-9]/.test(n)) n = `S${n}`;
    if (TAKEN.has(n)) n = `${n}Story`;
    for (let i = 2; storyNames.has(n); i++) n = `${pascal(s)}${TAKEN.has(pascal(s)) ? 'Story' : ''}${i}`;
    storyNames.add(n);
    return n;
  };
  const cellProps = (a: AxisInfo, figma: string) => (a === sw?.axis ? `{ checked: ${a.values.find((v) => v.figma === figma)?.value === sw.on} }`
    : a === radio?.axis ? (a.values.find((v) => v.figma === figma)?.value === radio.on ? '{ defaultChecked: true }' : '{}')
    : variantObject(a, figma));
  const table = (a: AxisInfo) => `{ ${a.values.map((v) => `${q(v.figma)}: ${cellProps(a, v.figma)}`).join(', ')} }`;
  const defaultDoc = `/** Figma default variant: ${Object.entries(defaults).map(([k, v]) => `${k}=${v}`).join(', ') || 'single variant'}. */`;
  let storyIcons = false;
  const stories: string[] = [sw ? `${defaultDoc}
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const control = within(canvasElement).getByRole('${sw.role}'${sw.labelled ? '' : `, { name: ${q(sw.label)} }`});
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);
${sw.role === 'radio' ? `    // WAI-ARIA radio: a selected radio stays selected (its group selects another).
    control.focus();
    await userEvent.keyboard(' ');
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);` : `    // WAI-ARIA ${sw.role}: Space toggles.
    control.focus();
    await userEvent.keyboard(' ');
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(false);`}
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
      else if (a.options.length > 1) out.push(`${a.prop}: ${axisLiteral(a, val.value, q)}${val.component ? ' as never' : ''}`);
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
    const control = within(canvasElement).getByRole('${sw.role}'${sw.labelled ? '' : `, { name: ${q(sw.label)} }`});
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
    const control = within(canvasElement).getByRole('${sw.role}'${sw.labelled ? '' : `, { name: ${q(sw.label)} }`});
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
  // Reference specs (references/*.yaml): one story per value of the main appearance property, as design-system
  // Storybooks list them (Primary, Secondary, Danger...), and one per state a prop sets (Disabled, Skeleton, Error).
  const PRIMARY_AXIS = ['kind', 'variant', 'style', 'type', 'appearance', 'emphasis', 'intent', 'color', 'hierarchy', 'status', 'severity'];
  const own = (a: AxisInfo) => a !== sw?.axis && a !== radio?.axis && a.options.length > 1;
  const primaryAxis = PRIMARY_AXIS.map((n) => multi.find((a) => own(a) && a.kind === 'variant' && !a.boolean && a.figma.trim().toLowerCase() === n)).find(Boolean);
  if (primaryAxis && primaryAxis.options.length <= 12) {
    for (const v of primaryAxis.values.filter((x) => x.role === 'enum' && x.value !== primaryAxis.defaultValue && !x.component)) {
      stories.push(`/** Figma ${primaryAxis.figma}=${v.figma}. */
export const ${storyName(v.figma)}: Story = {
  name: ${q(v.figma)},
  args: { ${primaryAxis.prop}: ${axisLiteral(primaryAxis, v.value, q)} },
};`);
    }
  }
  if (hasDisabled && !sw) {
    stories.push(`/** Figma State=Disabled. */
export const ${storyName('Disabled')}: Story = {
  name: 'Disabled',
  args: { disabled: true },
};`);
  }
  for (const a of multi.filter((x) => own(x) && x.kind === 'state')) {
    for (const v of a.values.filter((x) => x.role === 'enum' && x.value !== a.defaultValue)) {
      stories.push(v.component ? `/** Figma ${a.figma}=${v.figma}: its own component, ${v.component}. */
export const ${storyName(v.figma)}: Story = {
  name: ${q(v.figma)},
  render: (args) => <${v.component} {...args} />,
};` : `/** Figma ${a.figma}=${v.figma}. */
export const ${storyName(v.figma)}: Story = {
  name: ${q(v.figma)},
  args: { ${a.prop}: ${axisLiteral(a, v.value, q)} },
};`);
    }
  }
  // Toggles merged into a slot: switched by passing the Figma icon (or null when Figma shows it by default).
  const toggled = slotList.filter((x) => x.toggle && (x.toggle.default || x.toggle.icon));
  const shownBooleans = booleans.filter((b) => !internal(b.p.name));
  if (shownBooleans.length || toggled.length) {
    const n = storyName('Options');
    if (toggled.some((x) => !x.toggle!.default)) storyIcons = true;
    stories.push(`/** Figma boolean properties, each switched from its default. */
export const ${n}: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Row>
      <Labelled label="Default"><${name} {...args} /></Labelled>
${[...shownBooleans.map((b) => `      <Labelled label=${q(`${b.p.name}: ${String(b.p.default) === 'true' ? 'off' : 'on'}`)}><${name} {...args} ${b.prop}={${String(b.p.default) !== 'true'}} /></Labelled>`), ...toggled.map((x) => `      <Labelled label=${q(`${x.toggle!.figma}: ${x.toggle!.default ? 'off' : 'on'}`)}><${name} {...args} ${x.prop}={${x.toggle!.default ? 'null' : sizedIcon(x.toggle!.icon!, x.toggle!.size)}} /></Labelled>`)].join('\n')}
    </Row>
  ),
};`);
    sections.push({ heading: 'Options', story: n });
  }

  const argTypes = [
    ...(sw ? [`    checked: { control: 'boolean', description: ${q(`On or off (controlled). Figma: ${sw.axis.figma}`)} },`, `    defaultChecked: { control: 'boolean' },`] : []),
    ...propAxes.map((a) => `    ${a.prop}: ${internal(a.figma) ? `{ table: { disable: true }, description: ${q(`Internal (Figma ${a.figma}).`)} }` : !a.boolean && publicOptions(a).length < 2 ? `{ table: { disable: true }, description: ${q(`Figma: ${a.figma}. Its other values are separate components (${a.values.filter((v) => v.component).map((v) => v.component).join(', ')}).`)} }` : axisControl(a, q)},`),
    ...(hasDisabled ? [`    disabled: { control: 'boolean', description: 'Figma: State=Disabled' },`] : []),
    ...booleans.map((b) => `    ${b.prop}: ${internal(b.p.name) ? `{ table: { disable: true }, description: ${q(`Internal (Figma ${b.p.name}).`)} }` : `{ control: 'boolean', description: ${q(figmaNote(b.p.name, b.description))} }`},`),
    ...texts.map((t) => `    ${t.prop}: ${internal(t.p.name) ? `{ table: { disable: true }, description: ${q(`Internal (Figma ${t.p.name}).`)} }` : `{ control: 'text', description: ${q(figmaNote(t.p.name, t.description))} }`},`),
    ...exposedProps.map((e) => `    ${e.prop}: ${e.axis ? axisControl({ ...e.axis, figma: `${e.exposed!.name} › ${e.axis.figma}` }, q) : `{ control: '${e.type === 'boolean' ? 'boolean' : 'text'}', description: ${q(`Figma: ${e.exposed!.name} › ${e.figma}`)} }`},`),
    ...repeatList.map((r) => `    ${r.prop}: { control: false, description: ${q(`Your own ${r.component} items; ${name} sets ${r.driven.map((d) => d.prop).join(', ') || 'nothing'} on each.`)} },`),
    ...slotList.map((x) => `    ${x.prop}: { control: false, description: ${q(figmaNote(x.kind === 'swap' ? `${x.figma} (instance swap)` : `${x.figma} (placeholder)`, x.description))} },`),
    `    'data-force-state': { table: { disable: true } },`,
  ];
  if (combo) {
    stories.push(`export const OpensAndCloses: Story = {
  name: 'Opens and closes',
  args: { onOpenChange: fn() },
  play: async ({ canvasElement, args }) => {
    const box = canvasElement.querySelector<HTMLElement>('[aria-haspopup][aria-controls]')!;
    await expect(box).toHaveAttribute('role', '${combo.kind === 'combobox' ? 'combobox' : 'button'}');
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(box);
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await expect(args.onOpenChange).toHaveBeenCalledWith(true);
    await expect(document.getElementById(box.getAttribute('aria-controls')!)).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    box.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(box).toHaveAttribute('aria-expanded', 'true');
  },
};`);
  }
  if (collection?.item === 'option') {
    stories.push(`export const Selects: Story = {
  name: 'Selects',
  args: { onSelectedChange: fn() },
  play: async ({ canvasElement, args }) => {
    const list = within(canvasElement).getByRole('listbox');
    const options = within(list).getAllByRole('option');
    await expect(options.length).toBeGreaterThan(1);
    // An option that is not selected in the Figma default, so the click changes the selection.
    const target = options.find((x) => x.getAttribute('aria-selected') !== 'true') ?? options[0]!;
    await userEvent.click(target);
    await expect(target).toHaveAttribute('aria-selected', 'true');
    await expect(args.onSelectedChange).toHaveBeenCalled();
    // One tab stop: arrow keys move the active option, Space selects it.
    list.focus();
    await userEvent.keyboard('{Home}');
    await expect(list).toHaveAttribute('aria-activedescendant', options[0]!.id);
    await userEvent.keyboard('{ArrowDown}');
    await expect(list).toHaveAttribute('aria-activedescendant', options[1]!.id);
    await userEvent.keyboard(' ');
    await expect(options[1]).toHaveAttribute('aria-selected', 'true');
  },
};`);
  }
  if (collection?.item === 'menuitem') {
    stories.push(`export const MovesFocus: Story = {
  name: 'Moves between items',
  play: async ({ canvasElement }) => {
    const menu = within(canvasElement).getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    await expect(items.length).toBeGreaterThan(1);
    menu.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(menu).toHaveAttribute('aria-activedescendant', items[0]!.id);
    await userEvent.keyboard('{End}');
    await expect(menu).toHaveAttribute('aria-activedescendant', items[items.length - 1]!.id);
  },
};`);
  }
  if (collection && collection.selection !== 'none' && !listy(collection)) {
    const attr = collection.item === 'tab' ? 'aria-selected' : 'aria-checked';
    // An item that is not selected in the Figma default, so clicking it changes the selection.
    const t = [1, 2, 0].find((i) => !collection.initial.includes(i)) ?? 1;
    stories.push(`export const Selects: Story = {
  name: 'Selects',
  args: { onSelectedChange: fn() },
  play: async ({ canvasElement, args }) => {
    const items = [...canvasElement.querySelectorAll<HTMLElement>('[data-ds-item]')];
    await expect(items.length).toBeGreaterThan(1);
    await userEvent.click(items[${t}]!);
    await expect(items[${t}]).toHaveAttribute('${attr}', 'true');
    await expect(args.onSelectedChange).toHaveBeenCalled();${collection.selection === 'single' ? `
    // Arrow keys move the selection; only the selected item is in the tab order.
    items[${t}]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    const next = items[${t + 1} % items.length]!;
    await expect(next).toHaveAttribute('${attr}', 'true');
    await expect(items[${t}]).toHaveAttribute('${attr}', 'false');` : `
    await userEvent.click(items[${t}]!);
    await expect(items[${t}]).toHaveAttribute('${attr}', 'false');`}
  },
};`);
  }
  if (rootTag === 'button') {
    stories.push(`export const Activates: Story = {
  name: 'Activates',
  args: { onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    // WAI-ARIA button: Enter and Space activate it (native button).
    button.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};`);
  }
  if (rootTag === 'a') {
    stories.push(`export const IsALink: Story = {
  name: 'Is a link',
  args: { href: '#' },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link');
    await expect(link).toHaveAttribute('href', '#');
    link.focus();
    await expect(link).toHaveFocus();
  },
};`);
  }
  if (trig) {
    stories.push(`export const ExpandsAndCollapses: Story = {
  name: 'Expands and collapses',
  args: { onExpandedChange: fn() },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getAllByRole('button')[0]!;
    const before = button.getAttribute('aria-expanded') === 'true';
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-expanded', String(!before));
    await expect(args.onExpandedChange).toHaveBeenCalledWith(!before);
    const open = before ? null : button.getAttribute('aria-controls');
    if (open) await expect(document.getElementById(open)).not.toBeNull();
  },
};`);
  }
  if (disclosure) {
    stories.push(`export const ExpandsAndCollapses: Story = {
  name: 'Expands and collapses',
  args: { onExpandedChange: fn() },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getAllByRole('button')[0]!;
    const before = button.getAttribute('aria-expanded') === 'true';
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-expanded', String(!before));
    await expect(args.onExpandedChange).toHaveBeenCalledWith(!before);
    // WAI-ARIA disclosure: Enter and Space toggle it (native button).
    button.focus();
    await userEvent.keyboard('{Enter}');
    await expect(button).toHaveAttribute('aria-expanded', String(before));
    await expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeNull();
  },
};`);
  }
  stories.push(figmaVariantsStory);
  const storiesFile = `// Generated by ds-sync (${sw ? (sw.role === 'checkbox' ? 'checkbox' : 'switch') : radio ? 'radio' : input ? 'input' : dialog ? 'dialog' : 'generic'} template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
import type { Meta, StoryObj } from '@storybook/react-vite';
${dialog ? "import { useState } from 'react';\nimport { expect, fn, userEvent, within } from 'storybook/test';\n" : ''}${sw || radio?.kind === 'control' || radio?.kind === 'field' || input || disclosure || rootTag !== 'div' || (collection && (collection.selection !== 'none' || listy(collection))) || trig || combo ? "import { expect, fn, userEvent, within } from 'storybook/test';\n" : radio ? "import { expect, userEvent, within } from 'storybook/test';\n" : ''}
import { Labelled, Matrix, Row } from '../../storybook/layout';
${storyIcons ? "import { Icon } from '../../icons/Icon';\n" : ''}import { ${[name, ...axes.flatMap((a) => a.values.flatMap((v) => (v.component ? [v.component] : [])))].join(', ')}, type ${name}Props } from './${name}';

const meta = {
  title: ${q(opts.title)},
  component: ${name},
${needsName || rootTag === 'a' || rootTag === 'button' ? `  args: { ${[...(needsName ? [`'aria-label': ${q(humanize(name.replace(/([a-z])([A-Z])/g, '$1 $2')))}`] : []), ...(rootTag === 'a' ? ["href: '#'"] : []), ...(rootTag === 'button' ? ['onClick: fn()'] : [])].join(', ')} },\n` : ''}${sw ? `  args: { ${sw.labelled ? '' : `'aria-label': ${q(sw.label)}, `}onCheckedChange: fn() },\n` : radio?.kind === 'control' ? `  args: { 'aria-label': ${q(radio.label)}, onChange: fn() },\n` : radio?.kind === 'field' || input ? '  args: { onChange: fn() },\n' : dialog ? '  // Variant stories show open, non-modal dialogs in the page.\n  args: { open: true, modal: false, onOpenChange: fn() },\n' : ''}  argTypes: {
${argTypes.join('\n')}
  },
  parameters: { figma: { fileKey: ${q(ctx.fileKey)}, nodeId: ${q(set.nodeId)} }, generator: ${q(sw ? (sw.role === 'checkbox' ? 'checkbox' : 'switch') : radio ? 'radio' : input ? 'input' : dialog ? 'dialog' : 'generic')} },
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
    ...(input ? [{ prop: 'value / defaultValue / onChange / type / name / maxLength / autoComplete / ...', figma: `${ph!.l!.part.name} (text layer)`, note: 'Native input attributes; the Figma placeholder text is the placeholder.' }, { prop: 'invalid', figma: '—', note: 'aria-invalid without changing the look.' }] : []),
    ...(radio?.kind === 'field' ? [{ prop: 'label', figma: `${labelLayer?.part.name ?? 'text'} (text layer)`, note: 'Rendered in the <label>.' }, { prop: 'name / value / checked / defaultChecked / onChange', figma: '—', note: 'Passed to the radio input.' }] : []),
    ...(radio?.kind === 'group' ? [{ prop: 'label', figma: `${groupLabelLayer?.part.name ?? 'text'} (text layer)`, note: 'Names the radiogroup.' }, { prop: 'name / value / defaultValue / onValueChange', figma: '—', note: 'Shared by the radios inside.' }, { prop: 'children', figma: `${itemsLayer?.part.name ?? 'items'} (layer)`, note: 'Default: the Figma example items.' }] : []),
    ...axes.map((a) => a === radio?.axis
      ? { prop: 'checked / defaultChecked', figma: `${a.figma} (variant)`, note: `${a.values.map((v) => `${v.figma} → ${v.value === radio.on ? 'checked' : 'not checked'}`).join(', ')}; styled with :checked.` }
      : a === disclosure?.axis
      ? { prop: `${a.prop} / defaultExpanded / onExpandedChange`, figma: `${a.figma} (variant)`, note: 'Expanded state: aria-expanded on the header button; the panel shows when true.' }
      : a === sw?.axis
      ? { prop: 'checked / defaultChecked', figma: `${a.figma} (variant)`, note: `${a.values.map((v) => `${v.figma} → ${v.value === sw.on ? 'checked' : 'not checked'}`).join(', ')}; aria-checked.` }
      : ({ prop: a.options.length > 1 ? a.prop : '—', figma: `${a.figma} (variant)`, note: a.kind === 'state' ? `States: ${a.values.map((v) => `${v.figma} → ${v.role === 'pseudo' ? `:${v.state} (CSS)` : v.role === 'disabled' ? 'disabled' : v.role === 'base' ? 'default' : `${a.prop}="${v.value}"`}`).join(', ')}` : undefined, ...(a.kind === 'variant' && a.options.length > 1 ? { type: axisType(a, q), default: responsive.has(a) ? 'follows the viewport' : axisDefault(a, q) } : {}) })).map((m) => (m.note || m.type ? m : { prop: m.prop, figma: m.figma })),
    ...(hasDisabled ? [{ prop: 'disabled', figma: 'State=Disabled', type: 'boolean', default: 'false' }] : []),
    ...booleans.map((b) => ({ prop: b.prop, figma: `${b.p.name} (boolean)`, type: 'boolean', default: String(String(b.p.default) === 'true') })),
    ...texts.map((t) => ({ prop: t.prop, figma: `${t.p.name} (text)`, type: 'ReactNode', default: q(String(t.p.default)) })),
    ...exposedProps.map((e) => ({ prop: e.prop, figma: `${e.exposed!.name} › ${e.figma} (exposed nested instance)`, note: `Passed to the nested ${e.exposed!.entry.component}.`, type: e.tsType(q), default: e.derived ? 'follows the variant' : typeof e.default === 'string' && !e.axis ? q(e.default) : e.axis ? axisLiteral(e.axis, String(e.default), q) : String(e.default) })),
    ...repeatList.map((r) => ({ prop: r.prop, figma: `${byPath.get(r.path)?.part.name ?? r.path} (repeated ${r.component})`, note: `Children: ${name} sets ${r.driven.map((d) => (d.numbered ? `${d.prop} (numbered)` : d.prop)).join(', ') || 'nothing'} on each ${r.component}; the Figma examples are the default.`, type: 'ReactNode', default: 'the Figma examples' })),
    ...slotList.map((x) => ({ prop: x.prop, figma: x.toggle ? `${x.figma} (instance swap) + ${x.toggle.figma} (boolean)` : x.kind === 'swap' ? `${x.figma} (instance swap)` : `${x.figma} (placeholder instance)`, note: x.toggle ? `Slot with its visibility toggle: content shows it, null hides it; not set: ${x.toggle.default ? 'shown, with the Figma instance' : 'hidden'}.` : 'Slot: any content; the Figma instance is the default.', type: 'ReactNode', default: x.toggle && !x.toggle.default ? 'not set (hidden)' : 'the Figma instance', ...(x.toggle ? { toggle: { prop: x.toggle.prop, default: x.toggle.default } } : {}) })),
    ...unboundSwaps.map((s) => ({ prop: '—', figma: `${s.name} (instance swap)`, note: slotsEnabled ? 'Not bound to a layer in Figma; not exposed.' : 'Not exposed by this behaviour template yet.' })),
  ];
  const uniqueGaps = [...new Set(gaps)];
  if (responsive.size) css = [...responsive].reduce((c, a) => makeResponsive(c, a.attr, a.options), css);
  const core: GenericCore = { ...(combo ? { combo } : {}), ...(trig ? { trigger: { prop: trig.prop, trigger: trig.trigger, panel: trig.panel } } : {}), ...(collection ? { collection } : {}), ...(repeatList.length ? { repeats: repeatList } : {}), ...(responsive.size ? { responsive: [...responsive].map((a) => a.prop) } : {}), ...(rootTag !== 'div' ? { rootTag, ...(busyAxis ? { busyProp: busyAxis.prop } : {}), ...(needsName ? { storyLabel: humanize(name.replace(/([a-z])([A-Z])/g, '$1 $2')) } : {}), ...(nameFrom ? { nameFrom } : {}) } : {}), ...(disclosure ? { disclosure: { prop: disclosure.axis.prop, header: byPath.get(disclosure.header)!.role, panel: byPath.get(disclosure.panel)!.role, headerPath: disclosure.header, ...(disTrigger() ? { triggerPath: disTrigger()!.path } : {}) } } : {}), slots: slotList, toggles: mergedBooleans.map((b) => ({ b, slot: [...merged.values()].find((x) => x.toggle!.figma === b.p.name)! })), set, css, layers: all, axes, booleans, texts, hasDisabled, defaults, assumptions, gaps: uniqueGaps, mapping, nestedProps, exposed: exposedProps, nestedCheck, title: opts.title, description: set.description, rowAxis, colAxis, multi, consumed: [...consumed], ...(sw ? { behavior: sw } : {}), ...(input ? { input } : {}), ...(dialog ? { dialog } : {}), visual, ...(radio ? { radio, radioLayers: { ...(controlLayer ? { control: controlLayer.role } : {}), ...(rowPath !== undefined ? { row: byPath.get(rowPath)?.role ?? 'root' } : {}), ...(labelLayer ? { label: labelLayer.role } : {}), ...(itemsLayer ? { items: itemsLayer.role } : {}), ...(groupLabelLayer ? { groupLabel: groupLabelLayer.role } : {}), ...(controlName ? { controlComponent: controlName } : {}), ...(itemsLayer ? (() => { const f = all.find((c) => c.parent === itemsLayer.path && kindOf(c) === 'radio-field'); const n = f ? opts.instance(f.part)?.component : undefined; return n ? { fieldComponent: n } : {}; })() : {}), ...(forwardState ? { forwardStates: controlStates.filter((o) => stateProp?.options.includes(o)) } : {}) } } : {}) };
  const files = [
    { path: `${dir}/${name}.tsx`, content: withReactImports(tsx + separateComponents(name, axes)) },
    { path: `${dir}/${name}.module.css`, content: css },
    { path: `${dir}/${name}.stories.tsx`, content: storiesFile },
    { path: `${dir}/${name}.mdx`, content: mdxPage(name, name, sections) },
    { path: `${dir}/${name}.figma.json`, content: docsJson(ctx, [set], name, set.description, mapping, [...assumptions, ...uniqueGaps]) },
  ];
  return {
    files,
    report: { name, figmaSets: [`${set.name} (${set.nodeId})`], files: files.map((f) => f.path), props: mapping, assumptions, gaps: uniqueGaps, dependencies: styles.dependencies, ...(nestedCheck.layers ? { nested: nestedCheck } : {}) },
    core,
  };
}

/** Figma values decided to be their own component in code ("Skeleton" -> ButtonSkeleton): each renders the
 * component with that value, and takes every other prop. */
export function separateComponents(name: string, axes: AxisInfo[]): string {
  return axes.flatMap((a) => a.values.filter((v) => v.component).map((v) => `
/** Figma ${a.figma}=${v.figma}, as its own component (ds-sync.decisions.json). */
export function ${v.component}(props: Omit<${name}Props, '${a.prop}'>) {
  return <${name} {...props} ${a.prop}={${axisLiteral(a, v.value, q)} as never} />;
}
`)).join('');
}
