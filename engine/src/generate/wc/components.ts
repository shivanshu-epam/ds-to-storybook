/**
 * Web Components (Lit) renderers. Each reuses the model a React template computed
 * (same CSS, props, Figma copy), so visuals match by construction. Shadow DOM scopes the
 * generated class names; tokens are CSS custom properties, which cross the shadow boundary.
 */
import type { ComponentReport, DocTab, GeneratedFile, TemplateContext } from '../templates/common.ts';
import { docTabs, kebab, leadSentence, pascal } from '../templates/common.ts';
import type { AccordionCore } from '../templates/accordion.ts';
import type { ActionCore } from '../templates/action.ts';
import type { CheckboxCore } from '../templates/checkbox.ts';
import { isIcon, lookupExpr, SHAPES, type GenericCore, type InstanceRef, type LayerInfo } from '../templates/generic.ts';
import type { IRComponentSet, IRPart } from '../../ir/types.ts';
import { wcRadio } from './radio.ts';
import { wcInput } from './input.ts';
import { wcDialog } from './dialog.ts';

export interface WcOptions {
  prefix: string;
  packageName: string;
}

export interface WcResult {
  files: GeneratedFile[];
  tags: string[];
  module: string;
  typings: { tag: string; className: string; props: { name: string; type: string }[] }[];
  notes: string[];
}

export const tagFor = (prefix: string, name: string) => `${prefix}-${kebab(name)}`;
export const classFor = (prefix: string, name: string) => `${pascal(prefix)}${name}`;
/** Lit property -> HTML attribute: hasLeadingIcon -> has-leading-icon. */
export const attrFor = (prop: string) => prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const js = (v: unknown) => JSON.stringify(v);

/** Lit expression for a layer's text: the Figma text, or a lookup on the variant property that changes it. */
export const wcText = (l: LayerInfo, plain: string) => (l.textByAxis ? lookupExpr(l.textByAxis, (p) => (p === '$checked' ? 'this.checked' : `this.${wcProp(p)}`), 'string') : plain);

/** Properties every HTMLElement already has: a generated prop with one of these names gets a "Text"/"Value" suffix. */
const ELEMENT_RESERVED = new Set(['title', 'hidden', 'id', 'slot', 'style', 'role', 'dir', 'lang', 'draggable', 'inert', 'popover', 'translate', 'spellcheck', 'tabIndex', 'className', 'children', 'part', 'nonce', 'autofocus', 'accessKey', 'enterKeyHint', 'inputMode', 'contentEditable']);
export const wcProp = (prop: string) => (ELEMENT_RESERVED.has(prop) ? `${prop}Value` : prop);

// ---------------------------------------------------------------------------------------------
// Docs (MDX). Figma text goes in as JSX string expressions, so no escaping problems.

export function usage(o: WcOptions, tag: string, attrs: string, content: string, event: string): string {
  const el = (a: string, ev: string) => `<${tag}${a}${ev}>${content}</${tag}>`;
  const blocks = [
    ['HTML', 'html', `<script type="module">\n  import '${o.packageName}';\n</script>\n${el(attrs, '')}`],
    ['React 19', 'tsx', `import '${o.packageName}';\n// Typings: add ${o.packageName}/types/react.d.ts to your tsconfig.\n${el(attrs, event ? ` on${event[0]!.toUpperCase()}${event.slice(1)}={handle}` : '')}`],
    ['Vue 3', 'html', `<!-- vite.config: vue({ template: { compilerOptions: { isCustomElement: (t) => t.startsWith('${o.prefix}-') } } }) -->\n${el(attrs, event ? ` @${event}="handle"` : '')}`],
    ['Angular', 'html', `<!-- Component: schemas: [CUSTOM_ELEMENTS_SCHEMA]; main.ts: import '${o.packageName}'; -->\n${el(attrs, event ? ` (${event})="handle($event)"` : '')}`],
    ['Svelte', 'html', `<script>import '${o.packageName}';</script>\n${el(attrs, event ? ` on:${event}={handle}` : '')}`],
  ];
  return `## Use it in your app

This is a standard Web Component: it works in any framework, or none.

${blocks.map(([label, lang, code]) => `### ${label}\n\n<Source language=${js(lang)} code={${js(code)}} dark />`).join('\n\n')}`;
}

export function figmaDocsMdx(tabs: DocTab[], mapping: ComponentReport['props'], notes: string[], sets: IRComponentSet[], fileKey: string): string {
  const out: string[] = [];
  if (notes.length) out.push('## Generation notes', '', `<ul>${notes.map((n) => `<li>{${js(n)}}</li>`).join('')}</ul>`);
  out.push(
    '## Figma to code',
    '',
    `<table><thead><tr><th>Figma</th><th>Property / attribute</th><th>Note</th></tr></thead><tbody>${mapping
      .map((m) => `<tr><td>{${js(m.figma)}}</td><td><code>{${js(m.prop === '—' || m.prop.includes(' ') ? m.prop : `${m.prop} / ${attrFor(m.prop)}`)}}</code></td><td>{${js(m.note ?? '')}}</td></tr>`)
      .join('')}</tbody></table>`,
    '',
    `<p>Source: ${sets.map((s) => `<a href=${js(`https://www.figma.com/design/${fileKey}?node-id=${s.nodeId.replace(':', '-')}`)}>{${js(s.name)}}</a>`).join(', ')}. The Figma version is recorded in GENERATION-REPORT.md.</p>`,
  );
  for (const t of tabs) {
    out.push('', `<h2>{${js(t.title)}}</h2>`);
    for (const s of t.sections) {
      if (s.heading) out.push(s.level === 3 ? `<h3>{${js(s.heading)}}</h3>` : `<h4>{${js(s.heading)}}</h4>`);
      for (const p of s.paragraphs) out.push(`<p style={{ whiteSpace: 'pre-line' }}>{${js(p)}}</p>`);
    }
  }
  return out.join('\n');
}

export function mdx(name: string, description: string, sections: { heading: string; story: string }[], usageBlock: string, docs: string): string {
  return `{/* Generated by ds-sync from Figma. Do not edit by hand; edit the Figma docs or the generator. */}
import { Meta, Title, Subtitle, Canvas, Controls, Source } from '@storybook/addon-docs/blocks';
import * as Stories from './${name}.stories';

<Meta of={Stories} />

<Title>${name}</Title>

<Subtitle>{${js(description)}}</Subtitle>

<Canvas of={Stories.Default} />

<Controls of={Stories.Default} />

${sections.map((s) => `## ${s.heading}\n\n<Canvas of={Stories.${s.story}} />`).join('\n\n')}

${usageBlock}

${docs}
`;
}

export const header = (setNames: string, template: string) =>
  `// Generated by ds-sync (${template}, Web Components) from Figma ${setNames}. Do not edit by hand.\n`;

// ---------------------------------------------------------------------------------------------
// Generic template -> Lit element

export function wcGeneric(ctx: TemplateContext, name: string, core: GenericCore, o: WcOptions, instance: (part: IRPart) => InstanceRef | undefined, tagOf: (component: string) => string): WcResult {
  if (core.radio) return wcRadio(ctx, name, core, o, instance, tagOf);
  if (core.input) return wcInput(ctx, name, core, o, instance, tagOf);
  if (core.dialog) return wcDialog(ctx, name, core, o, instance, tagOf);
  const tag = tagFor(o.prefix, name);
  const cls = classFor(o.prefix, name);
  const dir = `src/components/${name}`;
  const { set, axes, hasDisabled } = core;
  const booleans = core.booleans.map((b) => ({ ...b, prop: wcProp(b.prop) }));
  const texts = core.texts.map((t) => ({ ...t, prop: wcProp(t.prop) }));
  const sw = core.behavior;
  const enumAxes = axes.filter((a) => a.options.length > 1 && a !== sw?.axis).map((a) => ({ ...a, prop: wcProp(a.prop) }));
  const busyProp = sw?.busy ? wcProp(sw.busy.prop) : undefined;
  const imports = new Set<string>();
  let usesIcon = false;
  const boolFor = (figma?: string) => booleans.find((b) => b.p.name === figma)?.prop;
  const textFor = (figma?: string) => texts.find((t) => t.p.name === figma)?.prop;
  const children = (parent: string) => core.layers.filter((l) => l.parent === parent);

  const render = (l: LayerInfo, indent: string): string => {
    const p = l.part;
    const c = `class="${l.role}"`;
    let el: string;
    if (p.type === 'TEXT') {
      const t = textFor(p.refs?.characters);
      el = `<span ${c}>\${${t ? `this.${t}` : wcText(l, js(p.text ?? ''))}}</span>`;
    } else if (p.type === 'INSTANCE') {
      const ic = p.instanceOf ? ctx.icons.get(p.instanceOf) : undefined;
      const nested = !isIcon(p) && p.instanceComponentId ? instance(p) : undefined;
      if (ic) {
        usesIcon = true;
        el = `<span ${c} aria-hidden="true">\${icon(${l.iconByAxis ? lookupExpr(l.iconByAxis, (p) => (p === '$checked' ? 'this.checked' : `this.${wcProp(p)}`), 'string') : js(ic.name)})}</span>`;
      } else if (nested && nested.component !== name) {
        const ntag = tagOf(nested.component);
        imports.add(`import '../${nested.component}/${ntag}';`);
        const props = nested.props
          .map((x) => (x.kind === 'force-state' ? `data-force-state=${js(x.value)}`
            : x.prop === 'aria-label' ? (nested.kind === 'switch' ? `accessible-label=${js(x.value)}` : `.label=\${${js(x.value)}}`)
            : x.prop === 'defaultChecked' ? '?checked=${true}'
            : `.${wcProp(x.prop)}=\${${js(x.value)}}`))
          .join(' ');
        el = `<span ${c}><${ntag}${props ? ' ' + props : ''}>${nested.text !== undefined ? `\${${wcText(l, js(nested.text))}}` : ''}</${ntag}></span>`;
        // Repeated instances: one element each (the React output does the same).
        for (const copy of l.copies ?? []) {
          const n = instance(copy);
          if (!n) continue;
          const cp = n.props.map((x) => (x.kind === 'force-state' ? `data-force-state=${js(x.value)}` : x.prop === 'aria-label' ? (n.kind === 'switch' ? `accessible-label=${js(x.value)}` : `.label=\${${js(x.value)}}`) : x.prop === 'defaultChecked' ? '?checked=${true}' : `.${wcProp(x.prop)}=\${${js(x.value)}}`)).join(' ');
          el += `\n${indent}<span ${c}><${ntag}${cp ? ' ' + cp : ''}>${n.text !== undefined ? `\${${js(n.text)}}` : ''}</${ntag}></span>`;
        }
      } else {
        el = `<span ${c} aria-hidden="true"></span>`;
      }
    } else if (SHAPES.has(p.type)) {
      el = `<span ${c} aria-hidden="true"></span>`;
    } else {
      const kids = children(l.path);
      const box = sw ? 'span' : 'div'; // a <button> may only hold phrasing content
      el = kids.length ? `<${box} ${c}>\n${kids.map((k) => render(k, indent + '  ')).join('\n')}\n${indent}</${box}>` : `<${box} ${c}></${box}>`;
    }
    const b = boolFor(p.refs?.visible);
    return b ? `${indent}\${this.${b} ? html\`${el}\` : nothing}` : `${indent}${el}`;
  };
  const body = children('').map((l) => render(l, '        ')).join('\n');

  const figmaOf = (prop: string) =>
    [...enumAxes.map((a) => [a.prop, a.figma]), ...booleans.map((b) => [b.prop, b.p.name]), ...texts.map((t) => [t.prop, t.p.name]), ['disabled', 'State=Disabled']].find(([x]) => x === prop)?.[1] ?? prop;
  const props = [
    ...(sw ? [
      { prop: 'checked', type: 'boolean', init: 'false', decl: '{ type: Boolean, reflect: true }' },
      { prop: 'accessibleLabel', type: 'string | undefined', init: 'undefined', decl: "{ type: String, attribute: 'accessible-label' }" },
      { prop: 'name', type: 'string | undefined', init: 'undefined', decl: '{ type: String, reflect: true }' },
      { prop: 'value', type: 'string', init: "'on'", decl: '{ type: String }' },
    ] : []),
    ...enumAxes.map((a) => ({ prop: a.prop, type: a.options.map(js).join(' | '), init: js(a.defaultValue), decl: `{ type: String, reflect: true, attribute: ${js(attrFor(a.prop))} }` })),
    ...(hasDisabled ? [{ prop: 'disabled', type: 'boolean', init: 'false', decl: '{ type: Boolean, reflect: true }' }] : []),
    ...booleans.map((b) => ({ prop: b.prop, type: 'boolean', init: String(String(b.p.default) === 'true'), decl: `{ type: Boolean, attribute: ${js(attrFor(b.prop))} }` })),
    ...texts.map((t) => ({ prop: t.prop, type: 'string', init: js(String(t.p.default)), decl: `{ type: String, attribute: ${js(attrFor(t.prop))} }` })),
  ];
  const dataAttrs = [
    ...(sw ? [`data-${sw.axis.attr}=\${this.checked ? ${js(sw.on)} : ${js(sw.off)}}`] : []),
    ...enumAxes.map((a) => `data-${a.attr}=\${this.${a.prop}}`),
    ...(hasDisabled ? ['?data-disabled=${this.disabled}', sw ? '?disabled=${this.disabled}' : "aria-disabled=${this.disabled ? 'true' : nothing}"] : []),
    ...(busyProp ? [`aria-busy=\${this.${busyProp} === 'loading' ? 'true' : nothing}`] : []),
    'data-force-state=${this.forceState ?? nothing}',
  ];

  const swDocs: Record<string, string> = { checked: `On or off. Figma: ${sw?.axis.figma}`, accessibleLabel: 'Accessible name (Figma has no label). Or use aria-labelledby on a wrapping label.', name: 'Form field name', value: 'Form value when on. Default "on"' };
  const component = `${header(js(set.name), sw ? 'switch template' : 'generic template')}// Visuals come from Figma. ${sw ? 'Behaviour: WAI-ARIA switch pattern (native button, role="switch", aria-checked), form-associated.' : 'Behaviour (keyboard, focus, ARIA role) is not specified in Figma and is not generated.'}
import { LitElement, html, nothing, unsafeCSS } from 'lit';

${usesIcon ? "import { icon } from '../../icons/icon';\n" : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import css from './${name}.css?inline';

export class ${cls} extends LitElement {
${sw ? '  static formAssociated = true;\n  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true };\n' : ''}  static override styles = [unsafeCSS(':host { display: contents; }'), unsafeCSS(css)];
  static override properties = {
${props.map((p) => `    ${p.prop}: ${p.decl},`).join('\n')}
    forceState: { type: String, attribute: 'data-force-state' },
  };

${props.map((p) => `  /** ${swDocs[p.prop] && sw ? swDocs[p.prop] : `Figma: ${figmaOf(p.prop)}`} */\n  declare ${p.prop}: ${p.type};`).join('\n')}
  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */
  declare forceState: string | undefined;

  constructor() {
    super();
${props.map((p) => `    this.${p.prop} = ${p.init};`).join('\n')}
  }

${sw ? `  private readonly internals = this.attachInternals();

  override updated() {
    this.internals.setFormValue(this.checked ? this.value : null);
  }

  private toggle() {
    if (${[hasDisabled ? 'this.disabled' : '', busyProp ? `this.${busyProp} === 'loading'` : ''].filter(Boolean).join(' || ') || 'false'}) return;
    this.checked = !this.checked;
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  override render() {
    return html\`<button type="button" role="switch" class="root" part="root" aria-checked=\${this.checked ? 'true' : 'false'} aria-label=\${this.accessibleLabel ?? nothing} ${dataAttrs.join(' ')} @click=\${this.toggle}>
${body}
      </button>\`;
  }
}` : `  override render() {
    return html\`<div class="root" part="root" ${dataAttrs.join(' ')}>
${body}
      </div>\`;
  }
}`}

if (!customElements.get('${tag}')) customElements.define('${tag}', ${cls});

declare global {
  interface HTMLElementTagNameMap {
    '${tag}': ${cls};
  }
}
`;

  // Stories: one attribute map per element, so a story value replaces the default binding instead of duplicating it.
  type Bind = string | boolean | { force: string };
  const baseBinds = (): Map<string, Bind> => new Map<string, Bind>([
    ...(sw ? [['checked', 'args.checked'], ['accessibleLabel', 'args.accessibleLabel']] as [string, Bind][] : []),
    ...enumAxes.map((a) => [a.prop, `args.${a.prop}`] as [string, Bind]),
    ...(hasDisabled ? [['disabled', 'args.disabled'] as [string, Bind]] : []),
    ...booleans.map((b) => [b.prop, `args.${b.prop}`] as [string, Bind]),
    ...texts.map((t) => [t.prop, `args.${t.prop}`] as [string, Bind]),
  ]);
  const isBool = (prop: string) => prop === 'disabled' || prop === 'checked' || booleans.some((b) => b.prop === prop);
  const el = (over: Record<string, Bind> = {}) => {
    const m = baseBinds();
    let force: string | undefined;
    for (const [k, v] of Object.entries(over)) {
      if (typeof v === 'object') force = v.force;
      else m.set(k, v);
    }
    const attrs = [...m].map(([prop, v]) => {
      const name = attrFor(prop);
      if (typeof v === 'boolean') return `?${name}=\${${v}}`;
      if (typeof v !== 'string') return '';
      if (v.startsWith('args.')) return isBool(prop) ? `?${name}=\${${v}}` : `${name}=\${${v}}`;
      return `${name}=${js(v)}`;
    });
    if (force) attrs.push(`data-force-state=${js(force)}`);
    return `html\`<${tag} ${attrs.filter(Boolean).join(' ')}></${tag}>\``;
  };
  const overFor = (a: (typeof enumAxes)[number] | (typeof axes)[number], figma: string): Record<string, Bind> => {
    const v = a.values.find((x) => x.figma === figma);
    if (!v) return {};
    if (v.role === 'pseudo') return { _force: { force: v.state! } };
    if (v.role === 'disabled') return { disabled: true };
    if (a === sw?.axis) return { checked: v.value === sw.on };
    return a.options.length > 1 ? { [wcProp(a.prop)]: v.value } : {};
  };
  const find = sw ? `const host = canvasElement.querySelector('${tag}')!;
    const control = within(shadowOf(canvasElement, '${tag}') as unknown as HTMLElement).getByRole('switch', { name: ${js(sw.label)} });
    const onChange = fn();
    host.addEventListener('change', onChange);` : '';
  const stories: string[] = [sw ? `export const Default: Story = {
  play: async ({ canvasElement }) => {
    ${find}
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(host.checked).toBe(true);
    await expect(onChange).toHaveBeenCalledTimes(1);
    // WAI-ARIA switch: Space toggles (Enter too, from the native button).
    control.focus();
    await userEvent.keyboard(' ');
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(onChange).toHaveBeenCalledTimes(2);
  },
};` : 'export const Default: Story = {};'];
  if (sw && hasDisabled) {
    stories.push(`/** Disabled: not focusable and does not toggle. */
export const DisabledDoesNotToggle: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    ${find}
    await expect(control).toBeDisabled();
    await userEvent.click(control, { pointerEventsCheck: 0 });
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(onChange).not.toHaveBeenCalled();
  },
};`);
  }
  if (sw && busyProp) {
    stories.push(`/** Loading: aria-busy, and clicks do not toggle. */
export const LoadingDoesNotToggle: Story = {
  args: { ${busyProp}: 'loading' },
  play: async ({ canvasElement }) => {
    ${find}
    await expect(control).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(onChange).not.toHaveBeenCalled();
  },
};`);
  }
  const sections: { heading: string; story: string }[] = [];
  const names = new Set(['Default', 'DisabledDoesNotToggle', 'LoadingDoesNotToggle']);
  const storyName = (s: string) => {
    let n = pascal(s) || 'Axis';
    if (/^[0-9]/.test(n)) n = `S${n}`;
    for (let i = 2; names.has(n); i++) n = `${pascal(s)}${i}`;
    names.add(n);
    return n;
  };
  if (core.rowAxis && core.colAxis) {
    const n = storyName(`${core.rowAxis.figma} And ${core.colAxis.figma}`);
    const rows = core.rowAxis.values.map((v) => v.figma);
    const cols = core.colAxis.values.map((v) => v.figma);
    stories.push(`/** Figma ${core.rowAxis.figma} × ${core.colAxis.figma}. Pseudo states are forced with data-force-state. */
export const ${n}: Story = {
  parameters: { controls: { disable: true } },
  render: (args) =>
    matrix(${js(`${core.rowAxis.figma} by ${core.colAxis.figma}`)}, ${js(rows)}, ${js(cols)}, (r, c) => {
${rows.map((r) => cols.map((c) => `      if (r === ${js(r)} && c === ${js(c)}) return ${el({ ...overFor(core.rowAxis!, r), ...overFor(core.colAxis!, c) })};`).join('\n')).join('\n')}
      return html\`\`;
    }),
};`);
    sections.push({ heading: `${core.rowAxis.figma} and ${core.colAxis.figma}`, story: n });
  }
  for (const a of core.multi.filter((x) => !core.consumed.includes(x))) {
    const n = storyName(a.figma);
    stories.push(`/** Figma ${a.figma}. */
export const ${n}: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => row([
${a.values.map((v) => `    labelled(${js(v.figma)}, ${el(overFor(a, v.figma))}),`).join('\n')}
  ]),
};`);
    sections.push({ heading: a.figma, story: n });
  }
  if (booleans.length) {
    const n = storyName('Options');
    stories.push(`/** Figma boolean properties, each switched from its default. */
export const ${n}: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => row([
    labelled('Default', ${el()}),
${booleans.map((b) => `    labelled(${js(`${b.p.name}: ${String(b.p.default) === 'true' ? 'off' : 'on'}`)}, ${el({ [b.prop]: String(b.p.default) !== 'true' })}),`).join('\n')}
  ]),
};`);
    sections.push({ heading: 'Options', story: n });
  }
  const layoutImports = ['matrix', 'row', 'labelled', 'shadowOf'].filter((f) => stories.some((st) => st.includes(`${f}(`)));
  const storiesFile = `${header(js(set.name), sw ? 'switch template' : 'generic template')}import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
${sw ? "import { expect, fn, userEvent, within } from 'storybook/test';\n" : ''}
${layoutImports.length ? `import { ${layoutImports.join(', ')} } from '../../storybook/layout';\n` : ''}import './${tag}';

const meta = {
  title: ${js(core.title)},
  component: '${tag}',
  args: { ${[...(sw ? ['checked: false', `accessibleLabel: ${js(sw.label)}`] : []), ...enumAxes.map((a) => `${a.prop}: ${js(a.defaultValue)}`), ...(hasDisabled ? ['disabled: false'] : []), ...booleans.map((b) => `${b.prop}: ${String(String(b.p.default) === 'true')}`), ...texts.map((t) => `${t.prop}: ${js(String(t.p.default))}`)].join(', ')} },
  argTypes: {
${[
    ...(sw ? [`    checked: { control: 'boolean', description: ${js(`On or off. Figma: ${sw.axis.figma}`)} },`, `    accessibleLabel: { control: 'text', description: 'Accessible name (Figma has no label)' },`] : []),
    ...enumAxes.map((a) => `    ${a.prop}: { control: '${a.options.length > 5 ? 'select' : 'inline-radio'}', options: ${js(a.options)}, description: ${js(`Figma: ${a.figma}`)} },`),
    ...(hasDisabled ? [`    disabled: { control: 'boolean', description: 'Figma: State=Disabled' },`] : []),
    ...booleans.map((b) => `    ${b.prop}: { control: 'boolean', description: ${js(`Figma: ${b.p.name}`)} },`),
    ...texts.map((t) => `    ${t.prop}: { control: 'text', description: ${js(`Figma: ${t.p.name}`)} },`),
  ].join('\n')}
  },
  render: (args) => ${el()},
  parameters: { figma: { fileKey: ${js(ctx.fileKey)}, nodeId: ${js(set.nodeId)} }, generator: '${sw ? 'switch' : 'generic'}' },
} satisfies Meta;

export default meta;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Story = StoryObj<any>;

${stories.join('\n\n')}
`;

  const firstAxis = enumAxes[0];
  const usageAttrs = sw ? ` accessible-label=${js(sw.label)} name=${js(kebab(name))}` : firstAxis ? ` ${attrFor(firstAxis.prop)}=${js(firstAxis.defaultValue)}` : '';
  const description = core.description || leadSentence(set.docFrames);
  const mapping = core.mapping.map((m) => ({ ...m, prop: m.prop === '—' ? m.prop : m.prop === 'checked / defaultChecked' ? 'checked' : wcProp(m.prop) }));
  const docs = figmaDocsMdx(docTabs(set.docFrames, name), mapping, [...core.assumptions, ...core.gaps], [set], ctx.fileKey);
  const files: GeneratedFile[] = [
    { path: `${dir}/${tag}.ts`, content: component },
    { path: `${dir}/${name}.css`, content: core.css },
    { path: `${dir}/${name}.stories.ts`, content: storiesFile },
    { path: `${dir}/${name}.mdx`, content: mdx(name, description, sections, usage(o, tag, usageAttrs, '', sw ? 'change' : ''), docs) },
  ];
  return {
    files,
    tags: [tag],
    module: tag,
    typings: [{ tag, className: cls, props: props.map((p) => ({ name: p.prop, type: p.type })) }],
    notes: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Action (Button) -> <x-button> with a native <button> inside, form-associated.

export function wcAction(ctx: TemplateContext, name: string, core: ActionCore, o: WcOptions): WcResult {
  const tag = tagFor(o.prefix, name);
  const cls = classFor(o.prefix, name);
  const dir = `src/components/${name}`;
  const enumProps = core.axes;
  const props = [
    ...enumProps.map((a) => ({ prop: a.prop, type: a.options.map((x) => js(x.value)).join(' | '), init: js(a.default), decl: '{ type: String, reflect: true }' })),
    { prop: 'disabled', type: 'boolean', init: 'false', decl: '{ type: Boolean, reflect: true }' },
    { prop: 'type', type: "'button' | 'submit' | 'reset'", init: "'button'", decl: '{ type: String }' },
    ...core.slots.map((s) => ({ prop: s.prop, type: 'string | undefined', init: 'undefined', decl: `{ type: String, attribute: ${js(attrFor(s.prop))} }` })),
    { prop: 'label', type: 'string | undefined', init: 'undefined', decl: '{ type: String }' },
  ];
  const slotProp = (re: RegExp) => core.slots.find((s) => re.test(s.prop))?.prop;
  const leading = slotProp(/leading/);
  const trailing = slotProp(/trailing/);

  const component = `${header(js(core.set.name), 'action archetype')}// Behaviour: native <button> (WAI-ARIA button pattern). Form-associated: type="submit" submits the surrounding form.
import { LitElement, html, nothing, unsafeCSS } from 'lit';

import { icon } from '../../icons/icon';
import css from './${name}.css?inline';

export class ${cls} extends LitElement {
  static formAssociated = true;
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true };
  static override styles = [unsafeCSS(':host { display: contents; } .label[hidden] { display: none; }'), unsafeCSS(css)];
  static override properties = {
${props.map((p) => `    ${p.prop}: ${p.decl},`).join('\n')}
    forceState: { type: String, attribute: 'data-force-state' },
    hasLabel: { state: true },
  };

${props.map((p) => `  declare ${p.prop}: ${p.type};`).join('\n')}
  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */
  declare forceState: string | undefined;
  declare hasLabel: boolean;
  private readonly internals = this.attachInternals();

  constructor() {
    super();
${props.map((p) => `    this.${p.prop} = ${p.init};`).join('\n')}
    this.hasLabel = false;
  }

  private onSlotChange(e: Event) {
    const nodes = (e.target as HTMLSlotElement).assignedNodes({ flatten: true });
    this.hasLabel = nodes.some((n) => n.nodeType === Node.ELEMENT_NODE || Boolean(n.textContent?.trim()));
  }

  private onClick() {
    if (this.disabled) return;
    if (this.type === 'submit') this.internals.form?.requestSubmit();
    if (this.type === 'reset') this.internals.form?.reset();
  }

  override render() {
    return html\`<button class="root" part="button" type="button" ${enumProps.map((a) => `data-${kebab(a.figma)}=\${this.${a.prop}}`).join(' ')} ?disabled=\${this.disabled} aria-label=\${this.label ?? nothing} data-force-state=\${this.forceState ?? nothing} @click=\${this.onClick}>
${leading ? `      \${this.${leading} ? html\`<span class="leadingIcon" aria-hidden="true">\${icon(this.${leading})}</span>\` : nothing}\n` : ''}      <span class="label" ?hidden=\${!this.hasLabel}><slot @slotchange=\${this.onSlotChange}></slot></span>
${trailing ? `      \${this.${trailing}${leading ? ` && !this.${leading}` : ''} ? html\`<span class="trailingIcon" aria-hidden="true">\${icon(this.${trailing})}</span>\` : nothing}\n` : ''}    </button>\`;
  }
}

if (!customElements.get('${tag}')) customElements.define('${tag}', ${cls});

declare global {
  interface HTMLElementTagNameMap {
    '${tag}': ${cls};
  }
}
`;

  const argsAttrs = [...enumProps.map((a) => `${a.prop}=\${args.${a.prop}}`), '?disabled=${args.disabled}'].join(' ');
  const btn = (extra: string, text = '${args.label}') => `html\`<${tag} ${argsAttrs}${extra ? ' ' + extra : ''} @click=\${args.onClick}>${text}</${tag}>\``;
  const [rowAxis, ...otherAxes] = enumProps;
  const sections: { heading: string; story: string }[] = [];
  const stories: string[] = [`/** Figma default variant. Clicking calls the handler once. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(shadowOf(canvasElement, '${tag}') as unknown as HTMLElement).getByRole('button', { name: ${js(core.labelText)} });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};`];
  if (rowAxis && core.stateAxis) {
    stories.push(`/** Figma Style grid: ${rowAxis.figma} × ${core.stateAxis}. Pseudo states are forced with data-force-state. */
export const ${pascal(rowAxis.figma)}sAndStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) =>
    matrix(${js(`${rowAxis.figma} by ${core.stateAxis}`)}, ${js(rowAxis.options.map((x) => x.figma))}, ${js(core.states.map((s) => s.figma))}, (r, c) => {
${rowAxis.options.map((ro) => core.states.map((s) => {
      // Replace the default bindings rather than adding a second attribute (Lit rejects duplicates).
      let attrs = argsAttrs.replace(`${rowAxis.prop}=\${args.${rowAxis.prop}}`, `${rowAxis.prop}=${js(ro.value)}`);
      if (s.kind === 'disabled') attrs = attrs.replace('?disabled=${args.disabled}', '?disabled=${true}');
      else if (s.kind === 'force') attrs += ` data-force-state="${s.force}"`;
      return `      if (r === ${js(ro.figma)} && c === ${js(s.figma)}) return html\`<${tag} ${attrs}>\${args.label}</${tag}>\`;`;
    }).join('\n')).join('\n')}
      return html\`\`;
    }),
};`);
    sections.push({ heading: 'Variants and states', story: `${pascal(rowAxis.figma)}sAndStates` });
  }
  for (const a of otherAxes) {
    stories.push(`/** Figma ${a.figma} axis. */
export const ${pascal(a.figma)}: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => row([
${a.options.map((x) => `    labelled(${js(x.figma)}, ${btn('').replace(`${a.prop}=\${args.${a.prop}}`, `${a.prop}=${js(x.value)}`)}),`).join('\n')}
  ]),
};`);
    sections.push({ heading: a.figma, story: pascal(a.figma) });
  }
  if (core.slots.some((s) => s.icon)) {
    stories.push(`/** Figma boolean slots, with the Figma default icons. */
export const WithIcons: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => row([
${core.slots.filter((s) => s.icon).map((s) => `    labelled(${js(s.figma)}, ${btn(`${attrFor(s.prop)}=${js(s.icon)}`)}),`).join('\n')}
  ]),
};`);
    sections.push({ heading: 'Icons', story: 'WithIcons' });
  }
  stories.push(`/** State=Disabled: clicks are ignored. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = within(shadowOf(canvasElement, '${tag}') as unknown as HTMLElement).getByRole('button');
    await expect(button).toBeDisabled();
    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};`);
  stories.push(`/** WAI-ARIA button pattern: focusable; Enter and Space activate. (Tab order inside Shadow DOM is not simulated by the test library, so focus is set directly.) */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = shadowOf(canvasElement, '${tag}');
    const button = within(root as unknown as HTMLElement).getByRole('button');
    await expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    button.focus();
    await expect(root.activeElement).toBe(button);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};`);

  const storiesFile = `${header(js(core.set.name), 'action archetype')}import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { expect, fn, userEvent, within } from 'storybook/test';

import { labelled, matrix, row, shadowOf } from '../../storybook/layout';
import './${tag}';

const meta = {
  title: 'Components/${name}',
  component: '${tag}',
  args: { ${enumProps.map((a) => `${a.prop}: ${js(a.default)}`).join(', ')}, disabled: false, label: ${js(core.labelText)}, onClick: fn() },
  argTypes: {
${enumProps.map((a) => `    ${a.prop}: { control: 'inline-radio', options: ${js(a.options.map((x) => x.value))}, description: ${js(`Figma: ${a.figma}`)} },`).join('\n')}
    disabled: { control: 'boolean', description: 'Figma: State=Disabled' },
    label: { control: 'text', description: 'Figma: label text (slot content)' },
  },
  render: (args) => ${btn('')},
  parameters: { figma: { fileKey: ${js(ctx.fileKey)}, nodeId: ${js(core.set.nodeId)} } },
} satisfies Meta;

export default meta;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Story = StoryObj<any>;

${stories.join('\n\n')}
`;

  const docs = figmaDocsMdx(docTabs(core.set.docFrames, name), core.mapping, ['Behaviour from the WAI-ARIA button pattern (native <button> inside Shadow DOM). Icon-only buttons need the label attribute for an accessible name.'], [core.set], ctx.fileKey);
  return {
    files: [
      { path: `${dir}/${tag}.ts`, content: component },
      { path: `${dir}/${name}.css`, content: core.css },
      { path: `${dir}/${name}.stories.ts`, content: storiesFile },
      { path: `${dir}/${name}.mdx`, content: mdx(name, core.description || leadSentence(core.set.docFrames), sections, usage(o, tag, rowAxis ? ` ${rowAxis.prop}=${js(rowAxis.default)}` : '', core.labelText, 'click'), docs) },
    ],
    tags: [tag],
    module: tag,
    typings: [{ tag, className: cls, props: props.map((p) => ({ name: p.prop, type: p.type })) }],
    notes: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Checkbox -> <x-checkbox> (form-associated) + <x-checkbox-group>

export function wcCheckbox(ctx: TemplateContext, name: string, core: CheckboxCore, o: WcOptions): WcResult {
  const tag = tagFor(o.prefix, name);
  const cls = classFor(o.prefix, name);
  const groupTag = `${tag}-group`;
  const groupCls = `${cls}Group`;
  const dir = `src/components/${name}`;
  const ic = (k: keyof CheckboxCore['icons']) => (core.icons[k] ? `\${icon(${js(core.icons[k])})}` : '');
  const component = `${header(core.names.control + ', ' + core.names.field + (core.names.group ? ', ' + core.names.group : ''), 'checkbox archetype')}// Behaviour: native checkbox input (WAI-ARIA checkbox pattern). Form-associated: the value is submitted with the surrounding form.
import { LitElement, html, nothing, unsafeCSS } from 'lit';

import { icon } from '../../icons/icon';
import css from './${name}.css?inline';

let uid = 0;

export class ${cls} extends LitElement {
  static formAssociated = true;
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true };
  static override styles = [unsafeCSS(':host { display: contents; }'), unsafeCSS(css)];
  static override properties = {
    size: { type: String, reflect: true },
    label: { type: String },
    heading: { type: String },
    description: { type: String },
    helperText: { type: String, attribute: 'helper-text' },
    checked: { type: Boolean },
    indeterminate: { type: Boolean },
    error: { type: String },
    invalid: { type: Boolean },
    warning: { type: String },
    readOnly: { type: Boolean, attribute: 'readonly' },
    disabled: { type: Boolean, reflect: true },
    name: { type: String },
    value: { type: String },
    accessibleLabel: { type: String, attribute: 'accessible-label' },
    forceState: { type: String, attribute: 'data-force-state' },
    groupReadOnly: { state: true },
    groupDisabled: { state: true },
  };

  /** Figma: ${core.names.control} Size. */
  declare size: ${core.sizes.map((s) => js(s.value)).join(' | ')};
  /** Figma: ${core.names.field} Value (text next to the box). */
  declare label: string | undefined;
  /** Figma: ${core.names.field} Label (heading above the box). */
  declare heading: string | undefined;
  declare description: string | undefined;
  declare helperText: string | undefined;
  declare checked: boolean;
  declare indeterminate: boolean;
  /** Figma: State=Invalid. The message shown under the checkbox. */
  declare error: string | undefined;
  /** Figma: Type=Error-*. Invalid styling without a message. */
  declare invalid: boolean;
  declare warning: string | undefined;
  declare readOnly: boolean;
  declare disabled: boolean;
  declare name: string | undefined;
  declare value: string;
  /** Accessible name when there is no visible label (e.g. a box alone in a grid). */
  declare accessibleLabel: string | undefined;
  declare forceState: string | undefined;
  declare groupReadOnly: boolean;
  declare groupDisabled: boolean;
  private readonly internals = this.attachInternals();
  private readonly uid = \`cb-\${++uid}\`;

  constructor() {
    super();
    this.size = ${js(core.defaultSize)};
    this.checked = false;
    this.indeterminate = false;
    this.invalid = false;
    this.readOnly = false;
    this.disabled = false;
    this.value = 'on';
    this.groupReadOnly = false;
    this.groupDisabled = false;
  }

  override updated() {
    this.internals.setFormValue(this.checked ? this.value : null);
  }

  private onClick(e: Event) {
    if (this.readOnly || this.groupReadOnly) e.preventDefault();
  }

  private onChange(e: Event) {
    const input = e.target as HTMLInputElement;
    this.checked = input.checked;
    this.indeterminate = false;
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  override render() {
    const isInvalid = Boolean(this.error) || this.invalid;
    const readOnly = this.readOnly || this.groupReadOnly;
    const disabled = this.disabled || this.groupDisabled;
    const descId = this.description ? \`\${this.uid}-description\` : undefined;
    const msgId = this.error || this.warning || this.helperText ? \`\${this.uid}-message\` : undefined;
    const describedBy = [descId, msgId].filter(Boolean).join(' ') || undefined;
    return html\`<div class="field" ?data-invalid=\${isInvalid} ?data-warning=\${Boolean(this.warning) && !isInvalid} ?data-readonly=\${readOnly} ?data-disabled=\${disabled} data-force-state=\${this.forceState ?? nothing}>
      \${this.heading ? html\`<span class="heading">\${this.heading}</span>\` : nothing}
      \${this.description ? html\`<span id=\${descId!} class="description">\${this.description}</span>\` : nothing}
      <label class="row" for=\${this.uid}>
        <span class="control" data-size=\${this.size} ?data-invalid=\${isInvalid} data-force-state=\${this.forceState ?? nothing}>
          <input id=\${this.uid} class="input" type="checkbox" .checked=\${this.checked} .indeterminate=\${this.indeterminate} ?disabled=\${disabled}
            aria-label=\${this.label ? nothing : this.accessibleLabel ?? nothing} aria-invalid=\${isInvalid ? 'true' : nothing} aria-readonly=\${readOnly ? 'true' : nothing} aria-describedby=\${describedBy ?? nothing}
            @click=\${this.onClick} @change=\${this.onChange} />
          <span class="focusRing" aria-hidden="true"></span>
          <span class="box" aria-hidden="true"></span>
          <span class="mark" aria-hidden="true">\${this.indeterminate ? html\`${ic('minus')}\` : html\`${ic('check')}\`}</span>
        </span>
        \${this.label ? html\`<span class="valueText">\${this.label}</span>\` : nothing}
      </label>
      \${this.helperText && !this.error && !this.warning ? html\`<span id=\${msgId!} class="helper">\${this.helperText}</span>\` : nothing}
      \${this.error ? html\`<span id=\${msgId!} class="errorRow"><span class="errorIcon" aria-hidden="true">${ic('error')}</span><span class="errorText">\${this.error}</span></span>\` : nothing}
      \${this.warning && !this.error ? html\`<span id=\${msgId!} class="warningRow"><span class="warningIcon" aria-hidden="true">${ic('warning')}</span><span class="warningText">\${this.warning}</span></span>\` : nothing}
    </div>\`;
  }
}

export class ${groupCls} extends LitElement {
  static override styles = [unsafeCSS(':host { display: contents; }'), unsafeCSS(css)];
  static override properties = {
    legend: { type: String },
    orientation: { type: String, reflect: true },
    error: { type: String },
    warning: { type: String },
    readOnly: { type: Boolean, attribute: 'readonly' },
    disabled: { type: Boolean, reflect: true },
  };

  declare legend: string;
  /** Figma: ${core.names.group ?? 'Group'} Orientation. */
  declare orientation: ${(core.orientations.length ? core.orientations.map((x) => js(x.value)) : ["'vertical'", "'horizontal'"]).join(' | ')};
  declare error: string | undefined;
  declare warning: string | undefined;
  declare readOnly: boolean;
  declare disabled: boolean;

  constructor() {
    super();
    this.legend = '';
    this.orientation = ${js(core.defaultOrientation)};
    this.readOnly = false;
    this.disabled = false;
  }

  /** Read-only and disabled apply to every checkbox inside. */
  override updated() {
    for (const el of this.querySelectorAll('${tag}')) {
      el.groupReadOnly = this.readOnly;
      el.groupDisabled = this.disabled;
    }
  }

  override render() {
    const hasMessage = Boolean(this.error || this.warning);
    return html\`<fieldset class="group" data-orientation=\${this.orientation} ?data-invalid=\${Boolean(this.error)} ?data-warning=\${Boolean(this.warning) && !this.error} ?data-readonly=\${this.readOnly} aria-describedby=\${hasMessage ? 'message' : nothing} ?disabled=\${this.disabled}>
      <legend class="legend">\${this.legend}</legend>
      <div class="items"><slot @slotchange=\${() => this.requestUpdate()}></slot></div>
      \${this.error ? html\`<span id="message" class="groupErrorRow"><span class="groupErrorIcon" aria-hidden="true">${ic('groupError')}</span><span class="groupErrorText">\${this.error}</span></span>\` : nothing}
      \${this.warning && !this.error ? html\`<span id="message" class="groupWarningRow"><span class="groupWarningIcon" aria-hidden="true">${ic('groupWarning')}</span><span class="groupWarningText">\${this.warning}</span></span>\` : nothing}
    </fieldset>\`;
  }
}

if (!customElements.get('${tag}')) customElements.define('${tag}', ${cls});
if (!customElements.get('${groupTag}')) customElements.define('${groupTag}', ${groupCls});

declare global {
  interface HTMLElementTagNameMap {
    '${tag}': ${cls};
    '${groupTag}': ${groupCls};
  }
}
`;

  const c = core.copy;
  const typeAttrs = (t: string) => {
    const k = t.toLowerCase();
    const a: string[] = [];
    if (k.includes('indeterminate')) a.push('?indeterminate=${true}');
    else if (!k.includes('unselected') && k.includes('selected')) a.push('?checked=${true}');
    if (k.startsWith('error')) a.push('?invalid=${true}');
    return a.join(' ');
  };
  const stateAttrs = (s: string) => {
    const k = s.toLowerCase();
    return /hover/.test(k) ? 'data-force-state="hover"' : /focus/.test(k) ? 'data-force-state="focus"' : /press/.test(k) ? 'data-force-state="pressed"' : /disabled/.test(k) ? '?disabled=${true}' : '';
  };
  const fieldAttrs = (s: string) => {
    const k = s.toLowerCase();
    return /focus/.test(k) ? 'data-force-state="focus"' : /invalid|error/.test(k) ? `error=${js(c.error)}` : /warning/.test(k) ? `warning=${js(c.warning)}` : /read/.test(k) ? '?readonly=${true} ?checked=${true}' : /disabled/.test(k) ? '?disabled=${true}' : '';
  };
  const cb = (extra: string) => `html\`<${tag} size=\${args.size} label=\${args.label} heading=\${args.heading ?? ''}${extra ? ' ' + extra : ''} @change=\${args.onChange}></${tag}>\``;
  const stories = `${header(core.names.control + ', ' + core.names.field + (core.names.group ? ', ' + core.names.group : ''), 'checkbox archetype')}import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { expect, fn, userEvent, within } from 'storybook/test';

import { labelled, matrix, row, shadowOf, stack } from '../../storybook/layout';
import './${tag}';

const meta = {
  title: 'Components/${name}',
  component: '${tag}',
  args: { size: ${js(core.defaultSize)}, label: ${js(c.value)}, heading: ${js(c.heading)}, onChange: fn() },
  argTypes: {
    size: { control: 'inline-radio', options: ${js(core.sizes.map((s) => s.value))}, description: ${js(`Figma: ${core.names.control} Size`)} },
    label: { control: 'text', description: ${js(`Figma: ${core.names.field} Value`)} },
    heading: { control: 'text', description: ${js(`Figma: ${core.names.field} Label`)} },
  },
  render: (args) => ${cb('')},
  parameters: { figma: { fileKey: ${js(ctx.fileKey)}, nodeIds: ${js(core.nodeIds)} } },
} satisfies Meta;

export default meta;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Story = StoryObj<any>;

const input = (canvas: HTMLElement) => within(shadowOf(canvas, '${tag}') as unknown as HTMLElement).getByRole('checkbox');

/** Figma default. Clicking toggles. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const box = within(shadowOf(canvasElement, '${tag}') as unknown as HTMLElement).getByRole('checkbox', { name: ${js(c.value)} });
    await expect(box).not.toBeChecked();
    await userEvent.click(box);
    await expect(box).toBeChecked();
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};

/** Figma ${core.names.field} Type: Unselected, Selected, Indeterminate. */
export const SelectionTypes: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => stack([
    html\`<${tag} size=\${args.size} label="Unselected"></${tag}>\`,
    html\`<${tag} size=\${args.size} label="Selected" ?checked=\${true}></${tag}>\`,
    html\`<${tag} size=\${args.size} label="Indeterminate" ?indeterminate=\${true}></${tag}>\`,
  ]),
  play: async ({ canvasElement }) => {
    const all = canvasElement.querySelectorAll('${tag}');
    await expect(within(all[1]!.shadowRoot as unknown as HTMLElement).getByRole('checkbox')).toBeChecked();
    await expect(within(all[2]!.shadowRoot as unknown as HTMLElement).getByRole('checkbox')).toBePartiallyChecked();
  },
};

/** Figma Style grid for ${core.names.control}: Type × State. */
export const ControlTypesAndStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) =>
    matrix(${js(`${core.names.control} Type by State`)}, ${js(core.types)}, ${js(core.states)}, (r, col) => {
${core.types.map((t) => core.states.map((s) => `      if (r === ${js(t)} && col === ${js(s)}) return html\`<${tag} size=\${args.size} accessible-label=${js(`${t} ${s}`)} ${[typeAttrs(t), stateAttrs(s)].filter(Boolean).join(' ')}></${tag}>\`;`).join('\n')).join('\n')}
      return html\`\`;
    }),
};

/** Figma ${core.names.control} Size. */
export const Sizes: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => row([
${core.sizes.map((s) => `    labelled(${js(s.figma)}, html\`<${tag} size=${js(s.value)} label=\${args.label} ?checked=\${true}></${tag}>\`),`).join('\n')}
  ]),
};

/** Figma ${core.names.field} State, with the Figma message copy. */
export const FieldStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => stack([
${core.fieldStates.map((s) => `    labelled(${js(s)}, ${cb(fieldAttrs(s))}),`).join('\n')}
  ]),
};

/** Read-only checkboxes keep their value. */
export const ReadOnly: Story = {
  render: (args) => ${cb('?readonly=${true} ?checked=${true}')},
  play: async ({ canvasElement }) => {
    const box = input(canvasElement);
    await userEvent.click(box);
    await expect(box).toBeChecked();
  },
};

/** WAI-ARIA checkbox pattern: focusable; Space toggles. (Focus is set directly: the test library does not simulate Tab inside Shadow DOM.) */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const root = shadowOf(canvasElement, '${tag}');
    const box = within(root as unknown as HTMLElement).getByRole('checkbox');
    box.focus();
    await expect(root.activeElement).toBe(box);
    await userEvent.keyboard(' ');
    await expect(box).toBeChecked();
  },
};
${core.hasGroup ? `
/** Figma ${core.names.group}. */
export const Group: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => html\`<${groupTag} legend=${js(c.legend)}>
    <${tag} size=\${args.size} label=${js(c.value)} ?checked=\${true}></${tag}>
    <${tag} size=\${args.size} label=${js(c.value)}></${tag}>
    <${tag} size=\${args.size} label=${js(c.value)} ?indeterminate=\${true}></${tag}>
  </${groupTag}>\`,
};

/** Figma ${core.names.group} Orientation. */
export const GroupOrientation: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => stack([
${core.orientations.map((x) => `    html\`<${groupTag} legend=${js(x.figma)} orientation=${js(x.value)}><${tag} size=\${args.size} label=${js(c.value)} ?checked=\${true}></${tag}><${tag} size=\${args.size} label=${js(c.value)}></${tag}></${groupTag}>\`,`).join('\n')}
  ]),
};

/** Figma ${core.names.group} State, with the Figma message copy. */
export const GroupStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => stack([
    html\`<${groupTag} legend="Enabled"><${tag} size=\${args.size} label=${js(c.value)}></${tag}></${groupTag}>\`,
    html\`<${groupTag} legend="Invalid" error=${js(c.groupError)}><${tag} size=\${args.size} label=${js(c.value)}></${tag}></${groupTag}>\`,
    html\`<${groupTag} legend="Warning" warning=${js(c.groupWarning)}><${tag} size=\${args.size} label=${js(c.value)}></${tag}></${groupTag}>\`,
    html\`<${groupTag} legend="Read-Only" ?readonly=\${true}><${tag} size=\${args.size} label=${js(c.value)} ?checked=\${true}></${tag}></${groupTag}>\`,
  ]),
};
` : ''}`;

  const sets = Object.values(ctx.sets);
  const docs = figmaDocsMdx(docTabs(sets.flatMap((s) => s.docFrames), name), core.mapping, ['Behaviour from the native checkbox and the WAI-ARIA checkbox pattern. Form-associated: checked boxes submit their value.'], sets, ctx.fileKey);
  return {
    files: [
      { path: `${dir}/${tag}.ts`, content: component },
      { path: `${dir}/${name}.css`, content: core.css },
      { path: `${dir}/${name}.stories.ts`, content: stories },
      {
        path: `${dir}/${name}.mdx`,
        content: mdx(name, core.description || leadSentence(sets.flatMap((s) => s.docFrames)), [
          { heading: 'Selection types', story: 'SelectionTypes' },
          { heading: 'Control types and states', story: 'ControlTypesAndStates' },
          { heading: 'Sizes', story: 'Sizes' },
          { heading: 'Field states', story: 'FieldStates' },
          ...(core.hasGroup ? [{ heading: 'Group', story: 'Group' }, { heading: 'Group states', story: 'GroupStates' }] : []),
        ], usage(o, tag, ` label=${js(c.value)}`, '', 'change'), docs),
      },
    ],
    tags: [tag, groupTag],
    module: tag,
    typings: [
      { tag, className: cls, props: [{ name: 'size', type: core.sizes.map((s) => js(s.value)).join(' | ') }, { name: 'label', type: 'string' }, { name: 'heading', type: 'string' }, { name: 'checked', type: 'boolean' }, { name: 'indeterminate', type: 'boolean' }, { name: 'error', type: 'string' }, { name: 'invalid', type: 'boolean' }, { name: 'warning', type: 'string' }, { name: 'readOnly', type: 'boolean' }, { name: 'disabled', type: 'boolean' }, { name: 'name', type: 'string' }, { name: 'value', type: 'string' }, { name: 'accessibleLabel', type: 'string' }] },
      { tag: groupTag, className: groupCls, props: [{ name: 'legend', type: 'string' }, { name: 'orientation', type: 'string' }, { name: 'error', type: 'string' }, { name: 'warning', type: 'string' }, { name: 'readOnly', type: 'boolean' }, { name: 'disabled', type: 'boolean' }] },
    ],
    notes: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Accordion -> <x-accordion> + <x-accordion-item>

export function wcAccordion(ctx: TemplateContext, name: string, core: AccordionCore, o: WcOptions): WcResult {
  const tag = tagFor(o.prefix, name);
  const cls = classFor(o.prefix, name);
  const itemTag = `${tag}-item`;
  const itemCls = `${cls}Item`;
  const dir = `src/components/${name}`;
  const variants = core.styleAxis?.options.map((x) => x.value) ?? [];
  const component = `${header(js(core.set.name), 'disclosure archetype')}// Behaviour: WAI-ARIA accordion pattern (Enter/Space toggle; ArrowDown, ArrowUp, Home, End move between headers).
import { LitElement, html, nothing, unsafeCSS } from 'lit';

${core.chevron ? "import { icon } from '../../icons/icon';\n" : ''}import css from './${name}.css?inline';

let uid = 0;

export class ${cls} extends LitElement {
  static override styles = [unsafeCSS(':host { display: contents; }'), unsafeCSS(css)];
  static override properties = {
${core.styleAxis ? '    variant: { type: String, reflect: true },\n' : ''}    expandMode: { type: String, attribute: 'expand-mode' },
    headingLevel: { type: Number, attribute: 'heading-level' },
    value: { type: Array },
  };

${core.styleAxis ? `  /** Figma: ${core.set.name} ${core.styleAxis.figma}. */\n  declare variant: ${variants.map(js).join(' | ')};\n` : ''}  /** Figma docs: single- or multiple-expand. */
  declare expandMode: 'single' | 'multiple';
  /** Not specified in Figma; default 3. */
  declare headingLevel: number;
  /** Open item values. */
  declare value: string[];

  constructor() {
    super();
${core.styleAxis ? `    this.variant = ${js(core.styleAxis.default)};\n` : ''}    this.expandMode = 'single';
    this.headingLevel = 3;
    this.value = [];
    this.addEventListener('accordion-toggle', (e) => this.toggle((e as CustomEvent<string>).detail));
    this.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  private get items(): ${itemCls}[] {
    return [...this.querySelectorAll('${itemTag}')] as ${itemCls}[];
  }

  private toggle(v: string) {
    const open = this.value.includes(v);
    this.value = open ? this.value.filter((x) => x !== v) : this.expandMode === 'single' ? [v] : [...this.value, v];
    this.dispatchEvent(new CustomEvent('value-change', { detail: this.value, bubbles: true, composed: true }));
  }

  private onKeyDown(e: KeyboardEvent) {
    const items = this.items.filter((i) => !i.disabled);
    const i = items.findIndex((x) => x.hasFocus());
    if (i < 0) return;
    const target = ({ ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 } as Record<string, number>)[e.key];
    if (target === undefined) return;
    e.preventDefault();
    items[target]?.focusHeader();
  }

  override updated() {
    for (const item of this.items) {
      item.open = this.value.includes(item.value);
${core.styleAxis ? '      item.variant = this.variant;\n' : ''}      item.headingLevel = this.headingLevel;
    }
  }

  override render() {
    return html\`<div class="accordion"><slot @slotchange=\${() => this.requestUpdate()}></slot></div>\`;
  }
}

export class ${itemCls} extends LitElement {
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true };
  static override styles = [unsafeCSS(':host { display: contents; }'), unsafeCSS(css)];
  static override properties = {
    value: { type: String },
    heading: { type: String },
    disabled: { type: Boolean, reflect: true },
    open: { type: Boolean, reflect: true },
    variant: { type: String },
    headingLevel: { type: Number },
    forceState: { type: String, attribute: 'data-force-state' },
  };

  declare value: string;
  /** Figma: header label. */
  declare heading: string;
  /** Figma: ${core.stateAxis}=Disabled. */
  declare disabled: boolean;
  /** Set by the parent accordion. */
  declare open: boolean;
  declare variant: string | undefined;
  declare headingLevel: number;
  declare forceState: string | undefined;
  private readonly uid = \`acc-\${++uid}\`;

  constructor() {
    super();
    this.value = '';
    this.heading = '';
    this.disabled = false;
    this.open = false;
    this.headingLevel = 3;
  }

  hasFocus(): boolean {
    return this.shadowRoot?.activeElement != null;
  }

  focusHeader() {
    this.shadowRoot?.querySelector('button')?.focus();
  }

  override render() {
    return html\`<div class="item" data-variant=\${this.variant ?? nothing} data-state=\${this.open ? 'open' : 'closed'} ?data-disabled=\${this.disabled}>
      <div class="heading" role="heading" aria-level=\${this.headingLevel}>
        <button type="button" id=\${\`\${this.uid}-header\`} class="header" aria-expanded=\${this.open ? 'true' : 'false'} aria-controls=\${\`\${this.uid}-panel\`} ?disabled=\${this.disabled} data-force-state=\${this.forceState ?? nothing}
          @click=\${() => this.dispatchEvent(new CustomEvent('accordion-toggle', { detail: this.value, bubbles: true, composed: true }))}>
          <span class="label">\${this.heading}</span>
${core.chevron ? `          <span class="chevron" aria-hidden="true">\${icon(${js(core.chevron)})}</span>\n` : ''}        </button>
      </div>
      <div id=\${\`\${this.uid}-panel\`} role="region" aria-labelledby=\${\`\${this.uid}-header\`} class="panel" ?hidden=\${!this.open}>
        <div class="body"><slot></slot></div>
      </div>
    </div>\`;
  }
}

if (!customElements.get('${tag}')) customElements.define('${tag}', ${cls});
if (!customElements.get('${itemTag}')) customElements.define('${itemTag}', ${itemCls});

declare global {
  interface HTMLElementTagNameMap {
    '${tag}': ${cls};
    '${itemTag}': ${itemCls};
  }
}
`;

  const acc = (attrs: string, items: string) => `html\`<${tag} ${core.styleAxis ? 'variant=${args.variant} ' : ''}expand-mode=\${args.expandMode} heading-level=\${args.headingLevel}${attrs ? ' ' + attrs : ''}>${items}</${tag}>\``;
  const item = (v: string, n: number, extra = '') => `<${itemTag} value="${v}" heading=\${t(${n})}${extra ? ' ' + extra : ''}>\${BODY}</${itemTag}>`;
  const headers = `const headers = (canvas: HTMLElement) => [...canvas.querySelectorAll('${itemTag}')].map((i) => within(i.shadowRoot as unknown as HTMLElement).getByRole('button'));`;
  const stateItem = (s: string, i: number) => {
    const k = s.toLowerCase();
    const extra = /hover/.test(k) ? 'data-force-state="hover"' : /focus/.test(k) ? 'data-force-state="focus"' : /disabled/.test(k) ? '?disabled=${true}' : '';
    const value = /expanded|open/.test(k) ? `.value=\${['s${i}']}` : '';
    return `    labelled(${js(s)}, ${acc(value, item(`s${i}`, i + 1, extra))}),`;
  };
  const stories = `${header(js(core.set.name), 'disclosure archetype')}import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { expect, userEvent, within } from 'storybook/test';

import { labelled, stack } from '../../storybook/layout';
import './${tag}';

/** Figma sample copy. Titles get a number so open panels have distinct names (axe landmark-unique). */
const TITLE = ${js(core.title)};
const BODY = ${js(core.body)};
const t = (n: number) => \`\${TITLE} \${n}\`;
${headers}

const meta = {
  title: 'Components/${name}',
  component: '${tag}',
  args: { ${core.styleAxis ? `variant: ${js(core.styleAxis.default)}, ` : ''}expandMode: 'single', headingLevel: 3 },
  argTypes: {
${core.styleAxis ? `    variant: { control: 'inline-radio', options: ${js(variants)}, description: ${js(`Figma: ${core.styleAxis.figma}`)} },\n` : ''}    expandMode: { control: 'inline-radio', options: ['single', 'multiple'], description: 'Figma docs: single- or multiple-expand' },
    headingLevel: { control: 'inline-radio', options: [2, 3, 4, 5, 6], description: 'Not in Figma (archetype default 3)' },
  },
  decorators: [(story) => html\`<div style="width:${core.width}px;max-width:100%">\${story()}</div>\`],
  render: (args) => ${acc('', `${item('one', 1)}${item('two', 2)}${item('three', 3)}`)},
  parameters: { figma: { fileKey: ${js(ctx.fileKey)}, nodeId: ${js(core.set.nodeId)} } },
} satisfies Meta;

export default meta;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Story = StoryObj<any>;

/** Three items with the Figma sample copy. Clicking a header opens its panel. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const [first] = headers(canvasElement);
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(first!);
    await expect(first).toHaveAttribute('aria-expanded', 'true');
  },
};

/** Single-expand: opening one item closes the other. */
export const SingleExpand: Story = {
  args: { expandMode: 'single' },
  render: (args) => ${acc('', `${item('one', 1)}${item('two', 2)}`)},
  play: async ({ canvasElement }) => {
    const [a, b] = headers(canvasElement);
    await userEvent.click(a!);
    await userEvent.click(b!);
    await expect(a).toHaveAttribute('aria-expanded', 'false');
    await expect(b).toHaveAttribute('aria-expanded', 'true');
  },
};

/** Multiple-expand: items open independently. */
export const MultipleExpand: Story = {
  args: { expandMode: 'multiple' },
  render: SingleExpand.render,
  play: async ({ canvasElement }) => {
    const [a, b] = headers(canvasElement);
    await userEvent.click(a!);
    await userEvent.click(b!);
    await expect(a).toHaveAttribute('aria-expanded', 'true');
    await expect(b).toHaveAttribute('aria-expanded', 'true');
  },
};
${core.styleAxis ? `
/** Figma ${core.styleAxis.figma}. */
export const Styles: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => stack([
${core.styleAxis.options.map((x, i) => `    labelled(${js(x.figma)}, ${acc(`variant=${js(x.value)} .value=\${['v${i}']}`, `${item(`v${i}`, i * 2 + 1)}${item(`w${i}`, i * 2 + 2)}`).replace('variant=${args.variant} ', '')}),`).join('\n')}
  ]),
};
` : ''}
/** Figma ${core.stateAxis} axis. Pseudo states are forced with data-force-state. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => stack([
${core.states.map(stateItem).join('\n')}
  ]),
};

/** WAI-ARIA accordion keyboard: Enter and Space toggle; ArrowDown, ArrowUp, Home and End move focus. */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const [a, b, c] = headers(canvasElement);
    a!.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(b!.getRootNode()).toHaveProperty('activeElement', b);
    await userEvent.keyboard('{End}');
    await expect(c!.getRootNode()).toHaveProperty('activeElement', c);
    await userEvent.keyboard('{Home}');
    await expect(a!.getRootNode()).toHaveProperty('activeElement', a);
    await userEvent.keyboard('{Enter}');
    await expect(a).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard(' ');
    await expect(a).toHaveAttribute('aria-expanded', 'false');
  },
};
`;

  const docs = figmaDocsMdx(docTabs(core.set.docFrames, name), core.mapping, ['Behaviour from the WAI-ARIA accordion pattern. Items are separate elements; the parent manages which are open.'], [core.set], ctx.fileKey);
  return {
    files: [
      { path: `${dir}/${tag}.ts`, content: component },
      { path: `${dir}/${name}.css`, content: core.css },
      { path: `${dir}/${name}.stories.ts`, content: stories },
      {
        path: `${dir}/${name}.mdx`,
        content: mdx(name, core.set.description || leadSentence(core.set.docFrames), [
          ...(core.styleAxis ? [{ heading: 'Styles', story: 'Styles' }] : []),
          { heading: 'States', story: 'States' },
          { heading: 'Single and multiple expand', story: 'MultipleExpand' },
        ], usage(o, tag, '', `\n  <${itemTag} value="one" heading=${js(core.title)}>${core.body}</${itemTag}>\n`, 'value-change'), docs),
      },
    ],
    tags: [tag, itemTag],
    module: tag,
    typings: [
      { tag, className: cls, props: [...(core.styleAxis ? [{ name: 'variant', type: variants.map(js).join(' | ') }] : []), { name: 'expandMode', type: "'single' | 'multiple'" }, { name: 'headingLevel', type: 'number' }, { name: 'value', type: 'string[]' }] },
      { tag: itemTag, className: itemCls, props: [{ name: 'value', type: 'string' }, { name: 'heading', type: 'string' }, { name: 'disabled', type: 'boolean' }] },
    ],
    notes: [],
  };
}
