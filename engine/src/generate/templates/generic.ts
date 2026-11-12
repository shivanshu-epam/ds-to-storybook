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
}

export function analyzeAxes(set: IRComponentSet): AxisInfo[] {
  const used = new Set<string>();
  return set.properties
    .filter((p) => p.type === 'VARIANT')
    .map((p) => {
      const opts = p.options ?? [];
      const isState = opts.some((o) => PSEUDO.some((x) => x.test.test(o)) || /^disabled$/i.test(o));
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
    else if (a.options.length > 1 && v.value !== a.defaultValue) attrs.push(`${a.prop}="${v.value}"`);
  }
  return attrs;
}

/** The same, as a props object literal (for story lookup tables). */
function variantObject(a: AxisInfo, figma: string): string {
  const v = a.values.find((x) => x.figma === figma);
  if (!v) return '{}';
  if (v.role === 'pseudo') return `{ 'data-force-state': '${v.state}' }`;
  if (v.role === 'disabled') return '{ disabled: true }';
  return a.options.length > 1 ? `{ ${a.prop}: ${q(v.value)} }` : '{}';
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
}

/** A generated component another component can embed. */
export interface RegistryEntry {
  component: string;
  importPath: string;
  kind: 'action' | 'generic' | 'switch';
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
    else if (a.options.length > 1 && v.value !== a.defaultValue) out.push({ prop: a.prop, kind: 'string', value: v.value });
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
  const sw = entry.kind === 'switch' ? switchAxis(plan.axes) : undefined;
  const props = variant ? variantProps(plan.axes.filter((a) => a !== sw?.axis), variant.values) : [];
  const over = part.instanceProps ?? {};
  const notes: string[] = [];
  if (sw && variant) {
    if (kebab(variant.values[sw.axis.figma] ?? '') === sw.on) props.push({ prop: 'defaultChecked', kind: 'boolean', value: true });
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

export interface LayerInfo {
  path: string;
  parent: string;
  part: IRPart;
  role: string;
}

/** Union of layers across all variants, in a stable order (default variant first). */
export function layers(set: IRComponentSet, defaultVariant: IRVariant): LayerInfo[] {
  const seen = new Map<string, IRPart>();
  for (const v of [defaultVariant, ...set.variants.filter((x) => x !== defaultVariant)]) {
    for (const p of v.parts) {
      const prev = seen.get(p.path);
      // Prefer a visible copy (it carries the real text and colours).
      if (!prev || (prev.hidden && !p.hidden)) seen.set(p.path, p);
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
    return { path: part.path, parent: part.parent, part, role };
  });
}

export const isIcon = (p: IRPart) => p.type === 'INSTANCE' && Boolean(p.instanceOf && /^icons?\//i.test(p.instanceOf));
export const SHAPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON', 'REGULAR_POLYGON']);

export function genericTemplate(ctx: TemplateContext, name: string, opts: { title: string; instance: (part: IRPart) => InstanceRef | undefined; behavior?: 'switch' }): TemplateResult {
  const set = ctx.sets.main;
  if (!set) throw new Error(`${name}: the generic template needs a "main" component set`);
  const dir = `src/components/${name}`;
  const axes = analyzeAxes(set);
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
  assumptions.push(sw
    ? `Behaviour from the WAI-ARIA switch pattern: a native button with role="switch" and aria-checked. Tab focuses it; Space and Enter toggle it. Figma ${sw.axis.figma}=${sw.axis.values.find((v) => v.value === sw.on)?.figma} is checked.`
    : 'Generated with the generic template: visuals come from Figma; keyboard, focus and ARIA behaviour are not specified.');
  const propAxes = axes.filter((a) => a.options.length > 1 && a !== sw?.axis);

  // Props
  const { booleans, texts, swaps, hasDisabled } = propPlan(set);
  if (swaps.length) gaps.push(`Instance swap properties not exposed as props (default instance rendered): ${swaps.map((s) => s.name).join(', ')}.`);
  const boolFor = (figma?: string) => booleans.find((b) => b.p.name === figma)?.prop;
  const textFor = (figma?: string) => texts.find((t) => t.p.name === figma)?.prop;

  // Styles
  const all = layers(set, defaultVariant);
  const byPath = new Map(all.map((l) => [l.path, l]));
  const partIn = (v: IRVariant, path: string) => v.parts.find((p) => p.path === path);
  const rootStyle = defaultVariant.style;
  const rootDisplay = rootStyle.layoutMode ? (rootStyle.sizingH === 'HUG' ? 'inline-flex' : 'flex') : 'inline-block';
  const roles: RoleDef[] = [
    { role: 'root', kind: 'node', display: rootDisplay, find: (v): Found => ({ style: v.style }) },
    ...all.map<RoleDef>((l) => {
      const bound = Boolean(l.part.refs?.visible && boolFor(l.part.refs.visible));
      const display = l.part.style.layoutMode ? 'flex' : isIcon(l.part) ? 'inline-flex' : l.part.type === 'TEXT' ? 'block' : 'block';
      return {
        role: l.role,
        kind: 'node',
        display,
        ...(l.parent ? { parent: byPath.get(l.parent)?.role } : {}),
        presence: !bound,
        includeHidden: bound,
        find: (v): Found | undefined => {
          const p = partIn(v, l.path);
          if (!p) return undefined;
          const parentStyle = l.parent ? partIn(v, l.parent)?.style : v.style;
          return { style: p.style, part: p, ...(parentStyle ? { parentStyle } : {}) };
        },
      };
    }),
  ];
  const model: StyleModel = {
    axes: axes.filter((a) => a.kind === 'variant').map<VariantAxis>((a) => ({ figma: a.figma, attr: a.attr, values: Object.fromEntries(a.values.map((v) => [v.figma, v.value])) })),
    stateAxes: axes.filter((a) => a.kind === 'state').map<StateAxis>((a) => ({
      figma: a.figma,
      states: Object.fromEntries(a.values.map((v) => [v.figma, v.role === 'base' ? null : v.role === 'pseudo' ? forced(v.state!, v.state === 'focus' ? ':focus-visible' : `${PSEUDO.find((x) => x.state === v.state)!.native}:not([data-disabled])`) : v.role === 'disabled' ? { target: 'root', selector: '[data-disabled]' } : { target: 'root', selector: `[data-${a.attr}="${v.value}"]` }])),
    })),
    roles,
  };
  const styles = generateStyles(set.variants, model, ctx.resolver);

  // JSX
  const imports = new Set<string>();
  let usesIcon = false;
  const children = (parent: string) => all.filter((l) => l.parent === parent);
  const render = (l: LayerInfo, indent: string): string => {
    const p = l.part;
    const cls = `className={styles.${l.role}}`;
    let el: string;
    if (p.type === 'TEXT') {
      const t = textFor(p.refs?.characters);
      el = `<span ${cls}>{${t ?? JSON.stringify(p.text ?? '')}}</span>`;
    } else if (p.type === 'INSTANCE') {
      const icon = p.instanceOf ? ctx.icons.get(p.instanceOf) : undefined;
      const nested = !isIcon(p) && p.instanceComponentId ? opts.instance(p) : undefined;
      if (icon) {
        usesIcon = true;
        el = `<span ${cls} aria-hidden="true"><Icon name="${icon.name}" /></span>`;
      } else if (nested && nested.component !== name) {
        imports.add(`import { ${nested.component} } from '${nested.importPath}';`);
        if (nested.usesIcon) usesIcon = true;
        gaps.push(...nested.notes);
        el = `<span ${cls}><${nested.component}${nested.attrs.length ? ' ' + nested.attrs.join(' ') : ''} /></span>`;
      } else {
        gaps.push(`Layer "${p.path}" is an instance of "${p.instanceOf ?? 'unknown'}", which is not generated here; rendered as an empty box.`);
        el = `<span ${cls} aria-hidden="true" />`;
      }
    } else if (SHAPES.has(p.type)) {
      gaps.push(`Layer "${p.path}" is a ${p.type.toLowerCase()} shape; approximated with its fill and size (no vector path).`);
      el = `<span ${cls} aria-hidden="true" />`;
    } else {
      const kids = children(l.path);
      const box = sw ? 'span' : 'div'; // a <button> may only hold phrasing content
      el = kids.length ? `<${box} ${cls}>\n${kids.map((k) => render(k, indent + '  ')).join('\n')}\n${indent}</${box}>` : `<${box} ${cls} />`;
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
    ...propAxes.map((a) => `  /** Figma: ${a.figma}. Default ${a.defaultValue}.${a === sw?.busy ? ' "loading" sets aria-busy and blocks toggling.' : ''} */\n  ${a.prop}?: ${a.options.map(q).join(' | ')};`),
    ...(hasDisabled ? ['  /** Figma: State=Disabled. */\n  disabled?: boolean;'] : []),
    ...booleans.map((b) => `  /** Figma: ${b.p.name} (boolean). Default ${b.p.default}. */\n  ${b.prop}?: boolean;`),
    ...texts.map((t) => `  /** Figma: ${t.p.name} (text). */\n  ${t.prop}?: ReactNode;`),
    `  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */\n  'data-force-state'?: string;`,
  ];
  const ownProps = [...(sw ? ['checked', 'defaultChecked', 'value', 'onChange'] : []), ...propAxes.map((a) => a.prop), ...(hasDisabled ? ['disabled'] : []), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop)];
  const destructure = [
    ...(sw ? ['checked', 'defaultChecked = false', 'onCheckedChange', 'onClick'] : []),
    ...propAxes.map((a) => `${a.prop} = ${q(a.defaultValue)}`),
    ...(hasDisabled ? ['disabled = false'] : []),
    ...booleans.map((b) => `${b.prop} = ${String(b.p.default) === 'true'}`),
    ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`),
    'className',
    '...rest',
  ];
  const dataAttrs = [
    ...(sw ? [`data-${sw.axis.attr}={on ? ${q(sw.on)} : ${q(sw.off)}}`] : []),
    ...propAxes.map((a) => `data-${a.attr}={${a.prop}}`),
    ...(hasDisabled ? ["data-disabled={disabled ? '' : undefined}", sw ? 'disabled={disabled}' : 'aria-disabled={disabled || undefined}'] : []),
    ...(sw?.busy ? ['aria-busy={busy || undefined}'] : []),
  ];

  const tsx = sw ? `// Generated by ds-sync (switch template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
// Visuals come from Figma. Behaviour: WAI-ARIA switch pattern (native button, role="switch", aria-checked).
import { useState, type ButtonHTMLAttributes${texts.length ? ', type ReactNode' : ''} } from 'react';

${usesIcon ? `import { Icon } from '../../icons/Icon';\n` : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import styles from './${name}.module.css';

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

${usesIcon ? `import { Icon } from '../../icons/Icon';\n` : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import styles from './${name}.module.css';

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
`;

  const css = `/* Generated by ds-sync (generic template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand. */
.root { box-sizing: border-box; position: relative; }
${all.map((l) => `.${l.role}`).join(', ')}${all.length ? ' { box-sizing: border-box; position: relative; margin: 0; min-width: 0; }' : ''}
${sw ? `
/* Native button reset (zero specificity, so the Figma styles below win). */
:where(.root) { appearance: none; border: 0; padding: 0; margin: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; }
.root:disabled, .root[aria-busy="true"] { cursor: not-allowed; }
${figmaFocus ? '' : `.root:focus-visible, .root[data-force-state~="focus"] { outline: 2px solid ${sw.focusColor}; outline-offset: 2px; }\n`}` : ''}
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
  const cellProps = (a: AxisInfo, figma: string) => (a === sw?.axis ? `{ checked: ${a.values.find((v) => v.figma === figma)?.value === sw.on} }` : variantObject(a, figma));
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
};` : `${defaultDoc}\nexport const Default: Story = {};`];
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
    ...propAxes.map((a) => `    ${a.prop}: { control: '${a.options.length > 5 ? 'select' : 'inline-radio'}', options: [${a.options.map(q).join(', ')}], description: 'Figma: ${a.figma}' },`),
    ...(hasDisabled ? [`    disabled: { control: 'boolean', description: 'Figma: State=Disabled' },`] : []),
    ...booleans.map((b) => `    ${b.prop}: { control: 'boolean', description: ${q(`Figma: ${b.p.name}`)} },`),
    ...texts.map((t) => `    ${t.prop}: { control: 'text', description: ${q(`Figma: ${t.p.name}`)} },`),
    `    'data-force-state': { table: { disable: true } },`,
  ];
  const storiesFile = `// Generated by ds-sync (${sw ? 'switch' : 'generic'} template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
import type { Meta, StoryObj } from '@storybook/react-vite';
${sw ? "import { expect, fn, userEvent, within } from 'storybook/test';\n" : ''}
import { Labelled, Matrix, Row } from '../../storybook/layout';
import { ${name}, type ${name}Props } from './${name}';

const meta = {
  title: ${q(opts.title)},
  component: ${name},
${sw ? `  args: { 'aria-label': ${q(sw.label)}, onCheckedChange: fn() },\n` : ''}  argTypes: {
${argTypes.join('\n')}
  },
  parameters: { figma: { fileKey: ${q(ctx.fileKey)}, nodeId: ${q(set.nodeId)} }, generator: ${q(sw ? 'switch' : 'generic')} },
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
    ...axes.map((a) => a === sw?.axis
      ? { prop: 'checked / defaultChecked', figma: `${a.figma} (variant)`, note: `${a.values.map((v) => `${v.figma} → ${v.value === sw.on ? 'checked' : 'not checked'}`).join(', ')}; aria-checked.` }
      : ({ prop: a.options.length > 1 ? a.prop : '—', figma: `${a.figma} (variant)`, note: a.kind === 'state' ? `States: ${a.values.map((v) => `${v.figma} → ${v.role === 'pseudo' ? `:${v.state} (CSS)` : v.role === 'disabled' ? 'disabled' : v.role === 'base' ? 'default' : `${a.prop}="${v.value}"`}`).join(', ')}` : undefined })).map((m) => (m.note ? m : { prop: m.prop, figma: m.figma })),
    ...booleans.map((b) => ({ prop: b.prop, figma: `${b.p.name} (boolean)` })),
    ...texts.map((t) => ({ prop: t.prop, figma: `${t.p.name} (text)` })),
    ...swaps.map((s) => ({ prop: '—', figma: `${s.name} (instance swap)`, note: 'Not exposed yet.' })),
  ];
  const uniqueGaps = [...new Set(gaps)];
  const core: GenericCore = { set, css, layers: all, axes, booleans, texts, hasDisabled, defaults, assumptions, gaps: uniqueGaps, mapping, title: opts.title, description: set.description, rowAxis, colAxis, multi, consumed: [...consumed], ...(sw ? { behavior: sw } : {}) };
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
