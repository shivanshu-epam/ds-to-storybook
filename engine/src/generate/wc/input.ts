/**
 * Text input pack as a Lit element: a native <input> and its <label> inside one shadow root
 * (so for/id and aria-describedby work), form-associated through ElementInternals with
 * value, required validity and a composed "change" event. Visuals and CSS are the React output's.
 */
import { docTabs, leadSentence, pascal, type GeneratedFile, type TemplateContext } from '../templates/common.ts';
import { axisControl, axisData, axisDefault, axisType, isIcon, SHAPES, type GenericCore, type InstanceRef, type LayerInfo } from '../templates/generic.ts';
import type { IRPart } from '../../ir/types.ts';
import { attrFor, classFor, figmaDocsMdx, header, mdx, tagFor, usage, wcProp, wcText, type WcOptions, type WcResult } from './components.ts';

const js = (v: unknown) => JSON.stringify(v);

export function wcInput(ctx: TemplateContext, name: string, core: GenericCore, o: WcOptions, instance: (part: IRPart) => InstanceRef | undefined, tagOf: (component: string) => string): WcResult {
  const ip = core.input!;
  const tag = tagFor(o.prefix, name);
  const cls = classFor(o.prefix, name);
  const dir = `src/components/${name}`;
  const { set } = core;
  const enumAxes = core.axes.filter((a) => a.options.length > 1).map((a) => ({ ...a, prop: wcProp(a.prop) }));
  const stateAxis = enumAxes.find((a) => a.prop === 'state');
  const errorValue = stateAxis?.options.find((x) => /^(error|invalid)$/.test(x));
  const booleans = core.booleans.map((b) => ({ ...b, prop: wcProp(b.prop) }));
  const texts = core.texts.map((t) => ({ ...t, prop: wcProp(t.prop) }));
  const boolFor = (figma?: string) => booleans.find((b) => b.p.name === figma)?.prop;
  const textFor = (figma?: string) => texts.find((t) => t.p.name === figma)?.prop;
  const pr = { placeholder: wcProp(ip.props.placeholder), label: ip.props.label && wcProp(ip.props.label), helper: ip.props.helper && wcProp(ip.props.helper), counter: ip.props.counter && wcProp(ip.props.counter), required: ip.props.required && wcProp(ip.props.required) };
  const imports = new Set<string>();
  let usesIcon = false;
  const children = (parent: string) => core.layers.filter((l) => l.parent === parent);

  const render = (l: LayerInfo, indent: string): string => {
    const p = l.part;
    const c = `class="${l.role}"`;
    let el: string;
    const ic = p.type === 'INSTANCE' && p.instanceOf ? ctx.icons.get(p.instanceOf) : undefined;
    if (l.role === ip.value) {
      el = `<input id="input" ${c} type=\${this.type} .value=\${live(this.value)} placeholder=\${this.${pr.placeholder} ?? nothing} name=\${this.name ?? nothing}
${indent}  ?disabled=\${this.disabled}${pr.required ? ` ?required=\${this.${pr.required}}` : ''} maxlength=\${this.maxlength ?? nothing} autocomplete=\${this.autocomplete ?? nothing}
${indent}  aria-invalid=\${this.isInvalid ? 'true' : nothing}${ip.helper ? ' aria-describedby="helper"' : ''}
${indent}  @input=\${this.onInput} @change=\${this.onChange} />`;
    } else if (l.role === ip.label) {
      el = `<label ${c} for="input">\${this.${pr.label}}</label>`;
    } else if (l.role === ip.helper) {
      el = `<span ${c} id="helper">\${this.${pr.helper}}</span>`;
    } else if (l.role === ip.counter) {
      el = `<span ${c}>\${this.maxlength !== undefined ? \`\${this.value.length}/\${this.maxlength}\` : this.${pr.counter}}</span>`;
    } else if (l.role === ip.required) {
      el = `<span ${c} aria-hidden="true">${js(p.text ?? '*').slice(1, -1)}</span>`;
    } else if (l.role === ip.clear && ic) {
      usesIcon = true;
      el = `<button type="button" ${c} aria-label="Clear" ?disabled=\${this.disabled} @click=\${this.clear}>\${icon(${js(ic.name)})}</button>`;
    } else if (p.type === 'TEXT') {
      const t = textFor(p.refs?.characters);
      el = `<span ${c}>\${${t ? `this.${t}` : wcText(l, js(p.text ?? ''))}}</span>`;
    } else if (ic) {
      usesIcon = true;
      el = `<span ${c} aria-hidden="true">\${icon(${js(ic.name)})}</span>`;
    } else if (p.type === 'INSTANCE') {
      const n = !isIcon(p) && p.instanceComponentId ? instance(p) : undefined;
      if (n && n.component !== name) {
        const ntag = tagOf(n.component);
        imports.add(`import '../${n.component}/${ntag}';`);
        el = `<span ${c}><${ntag}></${ntag}></span>`;
      } else el = `<span ${c} aria-hidden="true"></span>`;
    } else if (SHAPES.has(p.type)) {
      el = `<span ${c} aria-hidden="true"></span>`;
    } else {
      const kids = children(l.path);
      el = kids.length ? `<div ${c}>\n${kids.map((k) => render(k, indent + '  ')).join('\n')}\n${indent}</div>` : `<div ${c}></div>`;
    }
    const b = boolFor(p.refs?.visible);
    return b ? `${indent}\${this.${b} ? html\`${el}\` : nothing}` : `${indent}${el}`;
  };
  const body = children('').map((l) => render(l, '        ')).join('\n');

  type Prop = { prop: string; type: string; init: string; decl: string; doc: string };
  const props: Prop[] = [
    { prop: 'value', type: 'string', init: "''", decl: '{ type: String }', doc: 'Current value' },
    { prop: 'type', type: 'string', init: "'text'", decl: '{ type: String }', doc: 'Native input type: text, email, password, search, tel, url...' },
    { prop: 'name', type: 'string | undefined', init: 'undefined', decl: '{ type: String, reflect: true }', doc: 'Form field name' },
    { prop: 'maxlength', type: 'number | undefined', init: 'undefined', decl: '{ type: Number }', doc: 'Maximum length; also makes the character count live' },
    { prop: 'autocomplete', type: 'string | undefined', init: 'undefined', decl: '{ type: String }', doc: 'Native autocomplete hint' },
    { prop: 'invalid', type: 'boolean', init: 'false', decl: '{ type: Boolean }', doc: 'Marks the input invalid (aria-invalid) without changing its look' },
    ...enumAxes.map((a) => ({ prop: a.prop, type: axisType(a, js), init: axisDefault(a, js), decl: `{ type: ${a.boolean ? 'Boolean' : 'String'}, reflect: true, attribute: ${js(attrFor(a.prop))} }`, doc: `Figma: ${a.figma}${ip.renamed && a.prop === 'appearance' ? ' (Figma "Type"; "type" is the native input type)' : ''}` })),
    { prop: 'disabled', type: 'boolean', init: 'false', decl: '{ type: Boolean, reflect: true }', doc: 'Figma: State=Disabled' },
    ...booleans.map((b) => ({ prop: b.prop, type: 'boolean', init: String(String(b.p.default) === 'true'), decl: `{ type: Boolean, attribute: ${js(attrFor(b.prop))} }`, doc: `Figma: ${b.p.name}` })),
    ...texts.map((t) => ({ prop: t.prop, type: 'string', init: js(String(t.p.default)), decl: `{ type: String, attribute: ${js(attrFor(t.prop))} }`, doc: `Figma: ${t.p.name}` })),
  ];
  const dataAttrs = [...enumAxes.map((a) => `data-${a.attr === 'appearance' ? 'type' : a.attr}=\${${axisData(a, `this.${a.prop}`)}}`), '?data-disabled=${this.disabled}', '?data-invalid=${this.isInvalid}', 'data-force-state=${this.forceState ?? nothing}'];

  const component = `${header(js(set.name), 'input template')}// Visuals come from Figma. Behaviour: a native <input> with its <label> and description, form-associated.
import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { live } from 'lit/directives/live.js';

${usesIcon ? "import { icon } from '../../icons/icon';\n" : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import css from './${name}.css?inline';

export class ${cls} extends LitElement {
  static formAssociated = true;
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true };
  static override styles = [unsafeCSS(':host { display: contents; }'), unsafeCSS(css)];
  static override properties = {
${props.map((p) => `    ${p.prop}: ${p.decl},`).join('\n')}
    forceState: { type: String, attribute: 'data-force-state' },
  };

${props.map((p) => `  /** ${p.doc} */\n  declare ${p.prop}: ${p.type};`).join('\n')}
  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */
  declare forceState: string | undefined;
  private readonly internals = this.attachInternals();

  constructor() {
    super();
${props.map((p) => `    this.${p.prop} = ${p.init};`).join('\n')}
  }

  private get isInvalid() {
    return this.invalid${errorValue && stateAxis ? ` || this.${stateAxis.prop} === '${errorValue}'` : ''};
  }

  private get input() {
    return this.renderRoot.querySelector('input');
  }

  override updated() {
    this.internals.setFormValue(this.value);
    const input = this.input;
    if (input) this.internals.setValidity(input.validity, input.validationMessage, input);
  }

  /** The native "input" event is composed, so it already reaches listeners on this element. */
  private onInput(event: Event) {
    this.value = (event.target as HTMLInputElement).value;
  }

  /** The native "change" event is not composed: re-dispatch it from this element. */
  private onChange() {
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }
${ip.clear ? `
  /** Empties the input (the clear button) and keeps focus in it. */
  clear() {
    this.value = '';
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new CustomEvent('clear', { bubbles: true, composed: true }));
    this.input?.focus();
  }
` : ''}
  override render() {
    return html\`<div class="root" part="root" ${dataAttrs.join(' ')}>
${body}
      </div>\`;
  }
}

if (!customElements.get('${tag}')) customElements.define('${tag}', ${cls});

declare global {
  interface HTMLElementTagNameMap {
    '${tag}': ${cls};
  }
}
`;

  // Stories
  type Bind = string | boolean | { force: string };
  const storyProps = props.filter((p) => !['value', 'type', 'name', 'maxlength', 'autocomplete', 'invalid'].includes(p.prop));
  const isBool = (prop: string) => props.find((p) => p.prop === prop)?.type === 'boolean';
  const el = (over: Record<string, Bind> = {}) => {
    const m = new Map<string, Bind>(storyProps.map((p) => [p.prop, `args.${p.prop}`]));
    let force: string | undefined;
    for (const [k, v] of Object.entries(over)) {
      if (typeof v === 'object') force = v.force;
      else m.set(k, v);
    }
    const attrs = [...m].map(([prop, v]) => {
      const n = attrFor(prop);
      if (typeof v === 'boolean') return `?${n}=\${${v}}`;
      if (typeof v !== 'string') return '';
      if (v.startsWith('args.')) return isBool(prop) ? `?${n}=\${${v}}` : `${n}=\${${v}}`;
      return `${n}=${js(v)}`;
    });
    if (force) attrs.push(`data-force-state=${js(force)}`);
    return `html\`<${tag} ${attrs.filter(Boolean).join(' ')}></${tag}>\``;
  };
  const overFor = (a: GenericCore['axes'][number], figma: string): Record<string, Bind> => {
    const v = a.values.find((x) => x.figma === figma);
    if (!v) return {};
    if (v.role === 'pseudo') return { _force: { force: v.state! } };
    if (v.role === 'disabled') return { disabled: true };
    return a.options.length > 1 ? { [wcProp(a.prop)]: a.boolean ? v.value === 'true' : v.value } : {};
  };
  const labelText = String(core.texts.find((t) => t.prop === ip.props.label)?.p.default ?? '');
  const helperText = String(core.texts.find((t) => t.prop === ip.props.helper)?.p.default ?? '');
  const clearProp = booleans.find((b) => /clear/i.test(b.p.name))?.prop;
  const field = `within(shadowOf(canvasElement, '${tag}') as unknown as HTMLElement)`;
  const stories: string[] = [`export const Default: Story = {
  play: async ({ canvasElement }) => {
    const host = canvasElement.querySelector('${tag}')!;
    // The native "input" event is composed: it reaches listeners on the element.
    const onInput = fn();
    host.addEventListener('input', onInput);
    const field = ${ip.label ? `${field}.getByLabelText(${js(labelText)})` : `${field}.getByRole('textbox')`};
    await userEvent.type(field, 'Hello');
    await expect(field).toHaveValue('Hello');
    await expect(host.value).toBe('Hello');
    await expect(onInput).toHaveBeenCalledTimes(5);${ip.helper ? `
    await expect(field).toHaveAccessibleDescription(${js(helperText)});` : ''}
  },
};`];
  if (errorValue && stateAxis) {
    stories.push(`/** Figma State=${stateAxis.values.find((v) => v.value === errorValue)?.figma}: the input is marked invalid. */
export const Invalid: Story = {
  args: { ${stateAxis.prop}: ${js(errorValue)} },
  play: async ({ canvasElement }) => {
    await expect(${field}.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  },
};`);
  }
  if (ip.clear && clearProp) {
    stories.push(`/** The clear button empties the input and keeps focus in it. */
export const Clear: Story = {
  args: { ${clearProp}: true },
  play: async ({ canvasElement }) => {
    const host = canvasElement.querySelector('${tag}')!;
    host.value = 'Hello';
    await host.updateComplete;
    const shadow = ${field};
    await userEvent.click(shadow.getByRole('button', { name: 'Clear' }));
    await expect(shadow.getByRole('textbox')).toHaveValue('');
    await expect(host.value).toBe('');
    await expect(shadowOf(canvasElement, '${tag}').activeElement).toBe(shadow.getByRole('textbox'));
  },
};`);
  }
  const sections: { heading: string; story: string }[] = [];
  const names = new Set(['Default', 'Invalid', 'Clear']);
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
${rows.map((row) => cols.map((col) => `      if (r === ${js(row)} && c === ${js(col)}) return ${el({ ...overFor(core.rowAxis!, row), ...overFor(core.colAxis!, col) })};`).join('\n')).join('\n')}
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
  const storiesFile = `${header(js(set.name), 'input template')}import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { expect, fn, userEvent, within } from 'storybook/test';

${layoutImports.length ? `import { ${layoutImports.join(', ')} } from '../../storybook/layout';\n` : ''}import './${tag}';

const meta = {
  title: ${js(core.title)},
  component: '${tag}',
  args: { ${storyProps.map((p) => `${p.prop}: ${p.init}`).join(', ')} },
  argTypes: {
${enumAxes.map((a) => `    ${a.prop}: ${axisControl(a, js)},`).join('\n')}
  },
  render: (args) => ${el()},
  parameters: { figma: { fileKey: ${js(ctx.fileKey)}, nodeId: ${js(set.nodeId)} }, generator: 'input' },
} satisfies Meta;

export default meta;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Story = StoryObj<any>;

${stories.join('\n\n')}
`;

  const description = core.description || leadSentence(set.docFrames);
  const mapping = core.mapping.map((m) => ({ ...m, prop: m.prop === '—' || m.prop.includes(' ') ? m.prop.replace('value / defaultValue / onChange / type / name / maxLength / ...', 'value / type / name / maxlength / autocomplete') : wcProp(m.prop) }));
  const docs = figmaDocsMdx(docTabs(set.docFrames, name), mapping, [...core.assumptions, ...core.gaps], [set], ctx.fileKey);
  const files: GeneratedFile[] = [
    { path: `${dir}/${tag}.ts`, content: component },
    { path: `${dir}/${name}.css`, content: core.css },
    { path: `${dir}/${name}.stories.ts`, content: storiesFile },
    { path: `${dir}/${name}.mdx`, content: mdx(name, description, sections, usage(o, tag, ` ${ip.props.label ? `${attrFor(pr.label!)}="Email" ` : ''}type="email" name="email"`, '', 'change'), docs) },
  ];
  return {
    files,
    tags: [tag],
    module: tag,
    typings: [{ tag, className: cls, props: props.map((p) => ({ name: p.prop, type: p.type })) }],
    notes: [],
  };
}
