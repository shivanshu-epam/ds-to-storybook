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

/** A generated component another component can embed. */
export interface RegistryEntry {
  component: string;
  importPath: string;
  kind: 'action' | 'generic';
  set: IRComponentSet;
}

export interface InstanceRef {
  component: string;
  importPath: string;
  attrs: string[];
  usesIcon: boolean;
  notes: string[];
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
  const attrs = variant ? variantAttrs(plan.axes, variant.values) : [];
  const over = part.instanceProps ?? {};
  const notes: string[] = [];
  let usesIcon = false;
  if (entry.kind === 'action') {
    for (const b of plan.booleans.filter((x) => /icon/i.test(x.p.name))) {
      const on = over[b.p.name] ?? b.p.default;
      if (on !== true) continue;
      const side = /leading/i.test(b.p.name) ? /leading/i : /trailing/i;
      const icon = part.innerIcons?.find((i) => side.test(i.layer));
      const asset = icon ? icons.get(icon.name) : undefined;
      if (asset) {
        attrs.push(`${/leading/i.test(b.p.name) ? 'leadingIcon' : 'trailingIcon'}={<Icon name="${asset.name}" />}`);
        usesIcon = true;
      }
    }
    const labelBool = plan.booleans.find((x) => /label/i.test(x.p.name));
    const showLabel = labelBool ? (over[labelBool.p.name] ?? labelBool.p.default) !== false : true;
    if (showLabel && part.innerText) attrs.push(`children=${JSON.stringify(part.innerText)}`);
    if (!showLabel) {
      const label = humanize(part.name);
      attrs.push(`aria-label=${JSON.stringify(label)}`);
      notes.push(`Icon-only ${entry.component} "${part.path}" is named "${label}" from its Figma layer name; confirm the wording.`);
    }
  } else {
    for (const b of plan.booleans) {
      const v = over[b.p.name];
      if (typeof v === 'boolean' && v !== (String(b.p.default) === 'true')) attrs.push(`${b.prop}={${v}}`);
    }
    for (const t of plan.texts) {
      const v = over[t.p.name];
      if (typeof v === 'string' && v !== String(t.p.default)) attrs.push(`${t.prop}=${JSON.stringify(v)}`);
    }
  }
  return { component: entry.component, importPath: entry.importPath, attrs, usesIcon, notes };
}

interface LayerInfo {
  path: string;
  parent: string;
  part: IRPart;
  role: string;
}

/** Union of layers across all variants, in a stable order (default variant first). */
function layers(set: IRComponentSet, defaultVariant: IRVariant): LayerInfo[] {
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

const isIcon = (p: IRPart) => p.type === 'INSTANCE' && Boolean(p.instanceOf && /^icons?\//i.test(p.instanceOf));
const SHAPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON', 'REGULAR_POLYGON']);

export function genericTemplate(ctx: TemplateContext, name: string, opts: { title: string; instance: (part: IRPart) => InstanceRef | undefined }): TemplateResult {
  const set = ctx.sets.main;
  if (!set) throw new Error(`${name}: the generic template needs a "main" component set`);
  const dir = `src/components/${name}`;
  const axes = analyzeAxes(set);
  const defaults: Record<string, string> = Object.fromEntries(set.properties.filter((p) => p.type === 'VARIANT').map((p) => [p.name, String(p.default)]));
  const defaultVariant = set.variants.find((v) => Object.entries(defaults).every(([k, x]) => v.values[k] === x)) ?? set.variants[0];
  if (!defaultVariant) throw new Error(`${name}: component set has no variants`);
  const gaps: string[] = [];
  const assumptions: string[] = ['Generated with the generic template: visuals come from Figma; keyboard, focus and ARIA behaviour are not specified.'];

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
      el = kids.length ? `<div ${cls}>\n${kids.map((k) => render(k, indent + '  ')).join('\n')}\n${indent}</div>` : `<div ${cls} />`;
    }
    const b = boolFor(p.refs?.visible);
    return b ? `${indent}{${b} && (\n${indent}  ${el.replace(/\n/g, `\n  `)}\n${indent})}` : `${indent}${el}`;
  };
  const body = children('').map((l) => render(l, '      ')).join('\n');

  if (set.variants.length < axes.reduce((n, a) => n * a.values.length, 1)) {
    assumptions.push(`The Figma set has ${set.variants.length} of ${axes.reduce((n, a) => n * a.values.length, 1)} possible variant combinations; other combinations use the nearest defined styles.`);
  }
  if (axes.some((a) => a.values.some((v) => v.state === 'focus'))) {
    assumptions.push('A focus style exists in Figma, but the generic element is not focusable; it shows only when forced (data-force-state="focus") until behaviour is specified.');
  }

  const propLines = [
    ...axes.filter((a) => a.options.length > 1).map((a) => `  /** Figma: ${a.figma}. Default ${a.defaultValue}. */\n  ${a.prop}?: ${a.options.map(q).join(' | ')};`),
    ...(hasDisabled ? ['  /** Figma: State=Disabled. */\n  disabled?: boolean;'] : []),
    ...booleans.map((b) => `  /** Figma: ${b.p.name} (boolean). Default ${b.p.default}. */\n  ${b.prop}?: boolean;`),
    ...texts.map((t) => `  /** Figma: ${t.p.name} (text). */\n  ${t.prop}?: ReactNode;`),
    `  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */\n  'data-force-state'?: string;`,
  ];
  const ownProps = [...axes.filter((a) => a.options.length > 1).map((a) => a.prop), ...(hasDisabled ? ['disabled'] : []), ...booleans.map((b) => b.prop), ...texts.map((t) => t.prop)];
  const destructure = [
    ...axes.filter((a) => a.options.length > 1).map((a) => `${a.prop} = ${q(a.defaultValue)}`),
    ...(hasDisabled ? ['disabled = false'] : []),
    ...booleans.map((b) => `${b.prop} = ${String(b.p.default) === 'true'}`),
    ...texts.map((t) => `${t.prop} = ${q(String(t.p.default))}`),
    'className',
    '...rest',
  ];
  const dataAttrs = [
    ...axes.filter((a) => a.options.length > 1).map((a) => `data-${a.attr}={${a.prop}}`),
    ...(hasDisabled ? ["data-disabled={disabled ? '' : undefined}", 'aria-disabled={disabled || undefined}'] : []),
  ];

  const tsx = `// Generated by ds-sync (generic template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
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

  const css = `/* Generated by ds-sync (generic template) from Figma "${set.name}" (${set.nodeId}), version ${ctx.version}. Do not edit by hand. */
.root { box-sizing: border-box; position: relative; }
${all.map((l) => `.${l.role}`).join(', ')}${all.length ? ' { box-sizing: border-box; position: relative; margin: 0; min-width: 0; }' : ''}

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
  const table = (a: AxisInfo) => `{ ${a.values.map((v) => `${q(v.figma)}: ${variantObject(a, v.figma)}`).join(', ')} }`;
  const stories: string[] = [`/** Figma default variant: ${Object.entries(defaults).map(([k, v]) => `${k}=${v}`).join(', ') || 'single variant'}. */\nexport const Default: Story = {};`];
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
    ...axes.filter((a) => a.options.length > 1).map((a) => `    ${a.prop}: { control: '${a.options.length > 5 ? 'select' : 'inline-radio'}', options: [${a.options.map(q).join(', ')}], description: 'Figma: ${a.figma}' },`),
    ...(hasDisabled ? [`    disabled: { control: 'boolean', description: 'Figma: State=Disabled' },`] : []),
    ...booleans.map((b) => `    ${b.prop}: { control: 'boolean', description: ${q(`Figma: ${b.p.name}`)} },`),
    ...texts.map((t) => `    ${t.prop}: { control: 'text', description: ${q(`Figma: ${t.p.name}`)} },`),
    `    'data-force-state': { table: { disable: true } },`,
  ];
  const storiesFile = `// Generated by ds-sync (generic template) from Figma "${set.name}" (${set.nodeId}). Do not edit by hand.
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Labelled, Matrix, Row } from '../../storybook/layout';
import { ${name}, type ${name}Props } from './${name}';

const meta = {
  title: ${q(opts.title)},
  component: ${name},
  argTypes: {
${argTypes.join('\n')}
  },
  parameters: { figma: { fileKey: ${q(ctx.fileKey)}, nodeId: ${q(set.nodeId)}, version: ${q(ctx.version)} }, generator: 'generic' },
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
    ...axes.map((a) => ({ prop: a.options.length > 1 ? a.prop : '—', figma: `${a.figma} (variant)`, note: a.kind === 'state' ? `States: ${a.values.map((v) => `${v.figma} → ${v.role === 'pseudo' ? `:${v.state} (CSS)` : v.role === 'disabled' ? 'disabled' : v.role === 'base' ? 'default' : `${a.prop}="${v.value}"`}`).join(', ')}` : undefined })).map((m) => (m.note ? m : { prop: m.prop, figma: m.figma })),
    ...booleans.map((b) => ({ prop: b.prop, figma: `${b.p.name} (boolean)` })),
    ...texts.map((t) => ({ prop: t.prop, figma: `${t.p.name} (text)` })),
    ...swaps.map((s) => ({ prop: '—', figma: `${s.name} (instance swap)`, note: 'Not exposed yet.' })),
  ];
  const uniqueGaps = [...new Set(gaps)];
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
  };
}
