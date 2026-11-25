// Code mode, real components: for each Figma component that exists in code, stories and a docs page that render the
// team's own component (imported from their package), set up from Figma through the code map. Figma decides what
// is shown (every property, value and designed variant); code decides how it is called.
import type { ComponentApi } from '../../code/api.ts';
import type { CodeMapEntry, PropMapping, ValueTarget } from '../../code/map.ts';
import type { IRComponentSet } from '../../ir/types.ts';
import { pascal, q, type GeneratedFile } from '../templates/common.ts';

export interface CodeStoriesInput {
  name: string;
  title: string;
  from: string;
  sets: IRComponentSet[];
  entry: CodeMapEntry;
  api: ComponentApi;
  fileKey: string;
  /** Accessibility contract of the component's kind (reference spec). */
  accessibility?: { pattern: string; role: string; name: string; keyboard?: { key: string; action: string }[] };
  /** Example props from the config (data Figma does not have). */
  examples?: Record<string, string | number | boolean>;
  /** Export that holds this one (AccordionItem -> Accordion): stories render inside it. */
  parent?: string;
  /** Icon components (module and its exports), for slots that take a component such as renderIcon. */
  icons?: { from: string; names: Set<string> };
}

type Args = Record<string, string | boolean | number>;

const PRIMARY = ['kind', 'variant', 'style', 'type', 'appearance', 'emphasis', 'intent', 'color', 'hierarchy', 'status', 'severity'];
const lit = (v: string | boolean | number) => (typeof v === 'string' ? q(v) : String(v));
const obj = (a: Args) => `{ ${Object.entries(a).map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k)}: ${lit(v)}`).join(', ')} }`;
const TAKEN = new Set(['Default', 'Error', 'Map', 'Set', 'Date', 'Image', 'Option', 'Range', 'File', 'Text', 'Node', 'Element', 'Event', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'Promise', 'JSON', 'Math', 'URL', 'Selection', 'Location', 'History', 'Storage', 'Window', 'Document', 'Function', 'RegExp', 'Meta', 'StoryObj', 'Story', 'Labelled', 'Row', 'Matrix', 'fn']);

/** Code args for one Figma value, or a separate component, or nothing (a CSS state, or no counterpart). */
function target(m: PropMapping, t: ValueTarget | null | undefined): { args?: Args; component?: string } | undefined {
  if (!t || 'css' in t) return undefined;
  if ('component' in t) return { component: t.component };
  if ('prop' in t) return { args: { [t.prop]: t.value } };
  if (t.value === 'base') return { args: {} };
  if (m.shape === 'axis-to-boolean' || m.shape === 'boolean') return { args: { [m.code!]: t.value === 'true' } };
  return { args: { [m.code!]: t.value } };
}

/** How Figma's value of a property is set in code, for all mapping shapes with values. */
function valueTargets(m: PropMapping): Record<string, ValueTarget | null> | undefined {
  if (m.values) return m.values;
  if (m.figmaType === 'VARIANT' && m.shape === 'boolean' && m.code) return { True: { value: 'true' }, False: { value: 'false' }, true: { value: 'true' }, false: { value: 'false' } };
  return undefined;
}

export function codeStories(x: CodeStoriesInput): { files: GeneratedFile[]; shown: string[]; needsData: string[]; interactive: { values: Record<string, string[]>; variants: string[] } } {
  const { name, entry, api } = x;
  const exp = api.export;
  const props = new Map(api.props.map((p) => [p.name, p]));
  const all = x.sets.flatMap((s) => s.properties);
  const byFigma = new Map(entry.mappings.map((m) => [m.figma, m]));
  const components = new Set<string>([exp, ...(x.parent ? [x.parent] : [])]);
  const used = new Set<string>(['Default']);
  const story = (s: string) => {
    let n = pascal(s) || 'Story';
    if (/^[0-9]/.test(n)) n = `S${n}`;
    if (TAKEN.has(n) || n === exp) n = `${n}Story`;
    for (let i = 2; used.has(n); i++) n = `${pascal(s)}${i}`;
    used.add(n);
    return n;
  };

  // Default args: Figma's default variant and copy, in code terms; required props get a value so the component renders.
  const args: Args = {};
  const actionsRequired: string[] = [];
  for (const p of all) {
    const m = byFigma.get(p.name);
    if (!m?.code) continue;
    if (p.type === 'TEXT' && (m.shape === 'text' || m.shape === 'children')) args[m.code] = String(p.default);
    else if (p.type === 'VARIANT') { const t = target(m, valueTargets(m)?.[String(p.default)]); Object.assign(args, t?.args ?? {}); }
    else if (p.type === 'BOOLEAN' && m.shape === 'boolean') args[m.code] = String(p.default) === 'true';
  }
  Object.assign(args, x.examples ?? {});
  // An id links labels and messages to the control (Carbon and most libraries need it for accessible names).
  if (props.has('id') && !('id' in args)) args.id = `${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}-1`;
  for (const p of api.props) {
    if (p.optional || p.name in args) continue;
    if (p.type.kind === 'string' || p.type.kind === 'node') args[p.name] = p.name === 'id' ? `${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}-1` : p.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    else if (p.type.kind === 'enum') args[p.name] = p.type.options[0]!;
    else if (p.type.kind === 'boolean') args[p.name] = false;
    else if (p.type.kind === 'number') args[p.name] = /max/i.test(p.name) ? 100 : /^(value|defaultValue)$/.test(p.name) ? 50 : 0;
    else if (p.type.kind === 'other' && /^on[A-Z]/.test(p.name)) actionsRequired.push(p.name);
  }
  // Icon slots: the Figma default icon, as the icon component of the same name.
  const iconArgs: Record<string, string> = {};
  const iconImports = new Set<string>();
  const dv = x.sets[0]!.variants.find((v) => Object.entries(v.values).every(([k, val]) => String(x.sets[0]!.properties.find((p) => p.name === k)?.default) === val)) ?? x.sets[0]!.variants[0];
  for (const m of entry.mappings.filter((m) => m.figmaType === 'INSTANCE_SWAP' && m.code)) {
    const icon = dv?.parts.find((pt) => pt.refs?.mainComponent === m.figma)?.instanceOf;
    const id = icon ? pascal(icon) : undefined;
    const p = props.get(m.code!);
    if (!id || !x.icons?.names.has(id) || !p || !(p.type.kind === 'other' && p.type.text === 'component')) continue;
    iconArgs[m.code!] = id;
    iconImports.add(id);
    if (props.has('iconDescription') && !('iconDescription' in args)) args.iconDescription = icon!;
  }
  const own = new Set(api.props.map((p) => p.name));
  const holdsValue = ['value', 'checked', 'toggled'].some((n) => own.has(n)) || api.inherited.includes('placeholder');
  const actions = [...new Set([...actionsRequired, ...['onClick', 'onChange', 'onToggle', 'onClose', 'onSelect'].filter((a) => own.has(a) || (a === 'onClick' && api.inherited.includes('onClick')) || (a === 'onChange' && holdsValue && api.inherited.includes('onChange')))])];

  // Controls: every code prop, with the Figma property it comes from.
  const figmaOf = new Map<string, string[]>();
  for (const m of entry.mappings) {
    for (const p of [m.code, ...Object.values(m.values ?? {}).flatMap((t) => (t && 'prop' in t ? [t.prop] : []))]) if (p) figmaOf.set(p, [...(figmaOf.get(p) ?? []), m.figma]);
  }
  const argTypes = api.props.map((p) => {
    const figma = figmaOf.get(p.name);
    const desc = [figma ? `Figma: ${[...new Set(figma)].join(', ')}.` : 'Code only (not in Figma).', p.description ?? ''].filter(Boolean).join(' ');
    const control = p.type.kind === 'enum' ? `control: '${p.type.options.length > 5 ? 'select' : 'inline-radio'}', options: [${p.type.options.map(q).join(', ')}]`
      : p.type.kind === 'boolean' ? "control: 'boolean'" : p.type.kind === 'string' || p.type.kind === 'node' ? "control: 'text'" : p.type.kind === 'number' ? "control: 'number'" : 'control: false';
    return `    ${/^[A-Za-z_$][\w$]*$/.test(p.name) ? p.name : q(p.name)}: { ${control}, description: ${q(desc)} },`;
  });
  // Inherited props a Figma property maps to (children for the label text): controls too, with their Figma source.
  for (const [prop, figma] of figmaOf) {
    if (props.has(prop) || !api.inherited.includes(prop)) continue;
    argTypes.push(`    ${/^[A-Za-z_$][\w$]*$/.test(prop) ? prop : q(prop)}: { control: '${prop === 'disabled' || prop === 'readOnly' ? 'boolean' : 'text'}', description: ${q(`Figma: ${[...new Set(figma)].join(', ')}.`)} },`);
  }

  const idArg = 'id' in args;
  // Items are rendered inside their parent component, one parent per copy (a row of copies stays valid markup).
  const wrap = (jsx: string) => (x.parent ? `<${x.parent}Story>${jsx}</${x.parent}Story>` : jsx);
  const deco = x.parent ? '\n  decorators: [inParent],' : '';
  // Several copies side by side: the same landmark or id repeats only because the story shows copies.
  const MULTI = "a11y: { config: { rules: [{ id: 'landmark-unique', enabled: false }, { id: 'duplicate-id', enabled: false }] } }";
  // Required props Figma cannot fill (data arrays, render functions): the stories show nothing useful without
  // example data, so they are kept out of the test run and reported.
  const needsData = api.props.filter((p) => !p.optional && !(p.name in args) && !(p.name in iconArgs) && !actions.includes(p.name));
  const stories: string[] = [];
  const sections: { heading: string; story: string; note?: string }[] = [];
  const shown: string[] = [];
  const variantProps = all.filter((p) => p.type === 'VARIANT');
  const primary = PRIMARY.map((n) => variantProps.find((p) => p.name.trim().toLowerCase() === n && byFigma.get(p.name)?.shape === 'enum')).find(Boolean);
  if (primary) {
    const m = byFigma.get(primary.name)!;
    for (const o of primary.options ?? []) {
      if (o === String(primary.default)) continue;
      const t = target(m, m.values?.[o]);
      if (!t?.args) continue;
      stories.push(`/** Figma ${primary.name}=${o}. */\nexport const ${story(o)}: Story = {\n  name: ${q(o)},\n  args: ${obj(t.args)},${deco}\n};`);
    }
  }
  // One story per Figma variant property: each value, set the way code sets it.
  for (const p of variantProps) {
    const m = byFigma.get(p.name);
    const vt = m ? valueTargets(m) : undefined;
    if (!m || !vt) continue;
    const cells = (p.options ?? []).map((o) => ({ o, t: target(m, vt[o]) })).filter((c) => c.t);
    if (cells.length < 1) continue;
    for (const c of cells) if (c.t!.component) components.add(c.t!.component);
    const skipped = (p.options ?? []).filter((o) => !cells.some((c) => c.o === o));
    const n = story(p.name);
    const note = skipped.length ? `${skipped.join(', ')}: ${skipped.every((o) => vt[o] && 'css' in vt[o]!) ? 'real interactions on the component (hover, focus, press it)' : 'no counterpart in code'}.` : undefined;
    stories.push(`/** Figma ${p.name}${note ? `. ${note}` : ''} */
export const ${n}: Story = {
  name: ${q(p.name)},
  parameters: { controls: { disable: true }, ${MULTI} },
  render: (args) => (
    <Row>
${cells.map((c, i) => `      <Labelled label=${q(c.o)}>${wrap(c.t!.component ? `<${c.t!.component}Story />` : `<Component {...args} {...${obj(c.t!.args!)}}${idArg ? ` id={\`\${args.id}-${i + 1}\`}` : ''} />`)}</Labelled>`).join('\n')}
    </Row>
  ),
};`);
    sections.push({ heading: p.name, story: n, ...(note ? { note } : {}) });
    shown.push(p.name);
  }
  // Figma booleans and slots that map to code: on and off.
  const toggles = all.filter((p) => p.type === 'BOOLEAN' && byFigma.get(p.name)?.shape === 'boolean');
  if (toggles.length) {
    const n = story('Options');
    stories.push(`/** Figma boolean properties, each switched from its default. */
export const ${n}: Story = {
  name: 'Optional parts',
  parameters: { controls: { disable: true }, ${MULTI} },
  render: (args) => (
    <Row>
      <Labelled label="Default">${wrap('<Component {...args} />')}</Labelled>
${toggles.map((p, i) => `      <Labelled label=${q(`${p.name}: ${String(p.default) === 'true' ? 'off' : 'on'}`)}>${wrap(`<Component {...args} ${byFigma.get(p.name)!.code}={${String(p.default) !== 'true'}}${idArg ? ` id={\`\${args.id}-${i + 1}\`}` : ''} />`)}</Labelled>`).join('\n')}
    </Row>
  ),
};`);
    sections.push({ heading: 'Optional parts', story: n });
    shown.push(...toggles.map((p) => p.name));
  }

  // Every designed Figma variant through the map: the real component next to Figma, for the visual check.
  const rows = x.sets.flatMap((s) => s.variants.map((v) => {
    const a: Args = {};
    let comp: string | undefined;
    let ok = true;
    for (const [prop, value] of Object.entries(v.values)) {
      const m = byFigma.get(prop);
      const vt = m ? valueTargets(m) : undefined;
      const t = m && vt ? target(m, vt[value]) : undefined;
      if (!t) { if (!(m && vt?.[value] && 'value' in vt[value]! && vt[value]!.value === 'base')) ok = false; continue; }
      if (t.component) comp = t.component;
      Object.assign(a, t.args ?? {});
    }
    return { v, a, comp, ok, width: Math.round(v.style.width ?? 0) };
  })).filter((r) => r.ok);
  stories.push(`/** Every designed Figma variant that code can express, set through the Figma-to-code map (test only; compared with
 * Figma's renders by "ds-sync visual"). ${x.sets.reduce((n, s) => n + s.variants.length, 0) - rows.length} variant(s) need a hover, focus or press, or have no code counterpart. */
export const FigmaVariants: Story = {
  name: 'Figma variants',
  tags: ['!dev', '!test', '!autodocs'],
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 }}>
${rows.map((r) => `      <div data-figma-variant=${q(r.v.nodeId)} title=${q(r.v.name)} style={{ display: 'flex', width: ${r.width} }}>${wrap(r.comp ? `<${r.comp}Story />` : `<Component {...args} {...${obj(r.a)}} />`)}</div>`).join('\n')}
    </div>
  ),
};`);

  const interactive = { values: {} as Record<string, string[]>, variants: [] as string[] };
  for (const m of entry.mappings) {
    const vals = Object.entries(m.values ?? {}).filter(([, t]) => t && 'css' in t).map(([v]) => v);
    if (vals.length) interactive.values[m.figma] = vals;
  }
  for (const s of x.sets) for (const v of s.variants) if (!rows.some((r) => r.v.nodeId === v.nodeId) && Object.entries(v.values).some(([k, val]) => interactive.values[k]?.includes(val))) interactive.variants.push(v.nodeId);
  const set = x.sets[0]!;
  const tsx = `// Generated by ds-sync (code mode) from Figma "${set.name}" (${set.nodeId}): renders ${exp} from ${x.from}. Do not edit by hand.
import type { ComponentType } from 'react';
import type { ${x.parent ? 'Decorator, ' : ''}Meta, StoryObj } from '@storybook/react-vite';
${actions.length ? "import { fn } from 'storybook/test';\n" : ''}import { ${[...components].sort().join(', ')} } from ${q(x.from)};
${iconImports.size ? `import { ${[...iconImports].sort().join(', ')} } from ${q(x.icons!.from)};\n` : ''}
import { Labelled, Row } from '../../storybook/layout';

// The code component takes any of its props; stories pass them as plain objects.
const Component = ${exp} as unknown as ComponentType<Record<string, unknown>>;
${[...components].filter((c) => c !== exp).sort().map((c) => `const ${c}Story = ${c} as unknown as ComponentType<Record<string, unknown>>;\n`).join('')}
const meta: Meta<typeof Component> = {
  title: ${q(x.title)},
  component: Component,
  args: { ${[obj(args).slice(2, -2), ...Object.entries(iconArgs).map(([k, v]) => `${k}: ${v}`), ...actions.map((a) => `${a}: fn()`)].filter(Boolean).join(', ')} },
  argTypes: {
${argTypes.join('\n')}
  },
  parameters: { figma: { fileKey: ${q(x.fileKey)}, nodeId: ${q(set.nodeId)} }, generator: 'code' },${needsData.length ? `\n  // Needs example data Figma does not have (${needsData.map((p) => p.name).join(', ')}): not in the test run until a story provides it.\n  tags: ['!test'],` : ''}
};

export default meta;
type Story = StoryObj<typeof meta>;
${x.parent ? `\n// ${exp} is used inside ${x.parent}.\nconst inParent: Decorator = (Story) => <${x.parent}Story><Story /></${x.parent}Story>;\n` : ''}
/** Figma default variant, rendered by ${exp}. */
export const Default: Story = {${x.parent ? `\n  decorators: [inParent],\n` : ''}};

${stories.join('\n\n')}
`;
  const table = (head: string[], rows: string[][]) => `<table><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>{${JSON.stringify(c)}}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const fmt = (t: ValueTarget | null) => (!t ? '—' : 'css' in t ? `:${t.css} (CSS)` : 'component' in t ? `<${t.component}>` : 'prop' in t ? `${t.prop}=${JSON.stringify(t.value)}` : t.value);
  const desc = x.sets.map((s) => s.description).find((d) => d?.trim());
  const mdx = `import { Canvas, Controls, Meta, Primary, Title } from '@storybook/addon-docs/blocks';

import * as Stories from './${name}.stories';

<Meta of={Stories} />

<Title>${exp}</Title>

## Overview

<p>{${JSON.stringify(desc?.trim() ? desc.trim() : `${exp} from ${x.from}.`)}}</p>

## Preview

<Primary />

## Variants

${sections.map((s) => `### ${s.heading}\n\n${s.note ? `<p>{${JSON.stringify(s.note)}}</p>\n\n` : ''}<Canvas of={Stories.${s.story}} />`).join('\n\n')}

## Properties

<Controls of={Stories.Default} />

## Figma to code

<p>{${JSON.stringify(`How each Figma property of "${set.name}" is set on ${exp} (CODE-MAP.md has the reasons).`)}}</p>

${table(['Figma', 'Code', 'Values'], entry.mappings.map((m) => [m.figma, m.code ?? '—', m.values ? Object.entries(m.values).map(([v, t]) => `${v} → ${fmt(t)}`).join(', ') : '']))}

${entry.codeOnly.length ? `### Only in code\n\n${table(['Prop', 'Description'], entry.codeOnly.map((p) => [p, props.get(p)?.description ?? '']))}\n\n` : ''}${entry.conflicts.length ? `### For review\n\n<ul>${entry.conflicts.map((c) => `<li>{${JSON.stringify(c)}}</li>`).join('')}</ul>\n\n` : ''}${x.accessibility ? `## Accessibility\n\n<ul><li>{${JSON.stringify(`Pattern: ${x.accessibility.pattern}; role: ${x.accessibility.role}.`)}}</li><li>{${JSON.stringify(`Name: ${x.accessibility.name}`)}}</li>${(x.accessibility.keyboard ?? []).map((k) => `<li>{${JSON.stringify(`${k.key}: ${k.action}`)}}</li>`).join('')}</ul>\n\n<p>{${JSON.stringify('The contract for this kind of component (ds-sync reference spec); the story tests check the rendered markup with axe.')}}</p>\n\n` : ''}## Code

<p>{${JSON.stringify(`import { ${exp} } from '${x.from}';`)}}</p>
`;
  return { files: [{ path: `src/components/${name}/${name}.stories.tsx`, content: tsx }, { path: `src/components/${name}/${name}.mdx`, content: mdx }], shown, needsData: needsData.map((p) => p.name), interactive };
}
