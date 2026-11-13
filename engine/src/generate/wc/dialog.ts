/**
 * Dialog pack as a Lit element: a native <dialog> in the shadow root (showModal for modal),
 * the default slot as the body and a "footer" slot for actions, open/modal properties and
 * composed "open-change" events. Visuals and CSS are the React output's.
 */
import { docTabs, leadSentence, pascal, type GeneratedFile, type TemplateContext } from '../templates/common.ts';
import { isIcon, SHAPES, type GenericCore, type InstanceRef, type LayerInfo } from '../templates/generic.ts';
import type { IRPart } from '../../ir/types.ts';
import { attrFor, classFor, figmaDocsMdx, header, mdx, tagFor, usage, wcProp, wcText, type WcOptions, type WcResult } from './components.ts';

const js = (v: unknown) => JSON.stringify(v);

export function wcDialog(ctx: TemplateContext, name: string, core: GenericCore, o: WcOptions, instance: (part: IRPart) => InstanceRef | undefined, tagOf: (component: string) => string): WcResult {
  const d = core.dialog!;
  const tag = tagFor(o.prefix, name);
  const cls = classFor(o.prefix, name);
  const dir = `src/components/${name}`;
  const { set } = core;
  const enumAxes = core.axes.filter((a) => a.options.length > 1).map((a) => ({ ...a, prop: wcProp(a.prop) }));
  const booleans = core.booleans.map((b) => ({ ...b, prop: wcProp(b.prop) }));
  const texts = core.texts.map((t) => ({ ...t, prop: wcProp(t.prop) }));
  const boolFor = (figma?: string) => booleans.find((b) => b.p.name === figma)?.prop;
  const textFor = (figma?: string) => texts.find((t) => t.p.name === figma)?.prop;
  const typeProp = d.typeProp && wcProp(d.typeProp);
  const stateProp = d.stateProp && wcProp(d.stateProp);
  const imports = new Set<string>();
  let usesIcon = false;
  const children = (parent: string) => core.layers.filter((l) => l.parent === parent);

  const nestedEl = (c: string, part: IRPart, l: LayerInfo): string | undefined => {
    const n = !isIcon(part) && part.instanceComponentId ? instance(part) : undefined;
    if (!n || n.component === name) return undefined;
    const ntag = tagOf(n.component);
    imports.add(`import '../${n.component}/${ntag}';`);
    const attrs = n.props.map((x) => (x.kind === 'force-state' ? `data-force-state=${js(x.value)}` : x.prop === 'aria-label' ? `.label=\${${js(x.value)}}` : `.${wcProp(x.prop)}=\${${js(x.value)}}`));
    return `<span ${c}><${ntag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${n.text !== undefined ? `\${${wcText(l, js(n.text))}}` : ''}</${ntag}></span>`;
  };
  const render = (l: LayerInfo, indent: string): string => {
    const p = l.part;
    const c = `class="${l.role}"`;
    let el: string;
    const ic = p.type === 'INSTANCE' && p.instanceOf ? ctx.icons.get(p.instanceOf) : undefined;
    if (l.role === d.title && p.type === 'TEXT') {
      const t = textFor(p.refs?.characters);
      el = `<span ${c} id="title">\${${t ? `this.${t}` : js(p.text ?? '')}}</span>`;
    } else if (l.role === d.close && ic) {
      usesIcon = true;
      el = `<button type="button" ${c} aria-label="Close" @click=\${() => this.setOpen(false)}>\${icon(${js(ic.name)})}</button>`;
    } else if (p.type === 'TEXT') {
      const t = textFor(p.refs?.characters);
      el = `<span ${c}>\${${t ? `this.${t}` : wcText(l, js(p.text ?? ''))}}</span>`;
    } else if (ic) {
      usesIcon = true;
      el = `<span ${c} aria-hidden="true">\${icon(${js(ic.name)})}</span>`;
    } else if (p.type === 'INSTANCE') {
      el = [p, ...(l.copies ?? [])].map((x) => nestedEl(c, x, l)).filter(Boolean).join(`\n${indent}`) || `<span ${c} aria-hidden="true"></span>`;
    } else if (SHAPES.has(p.type)) {
      el = `<span ${c} aria-hidden="true"></span>`;
    } else {
      const kids = children(l.path);
      const inner = kids.map((k) => render(k, indent + '    ')).join('\n');
      el = l.role === d.body
        ? `<div ${c} id="body"><slot>\n${inner}\n${indent}  </slot></div>`
        : l.role === d.footer
          ? `<div ${c}><slot name="footer">\n${inner}\n${indent}  </slot></div>`
          : kids.length ? `<div ${c}>\n${kids.map((k) => render(k, indent + '  ')).join('\n')}\n${indent}</div>` : `<div ${c}></div>`;
    }
    const b = boolFor(p.refs?.visible);
    return b ? `${indent}\${this.${b} ? html\`${el}\` : nothing}` : `${indent}${el}`;
  };
  const body = children('').map((l) => render(l, '        ')).join('\n');

  type Prop = { prop: string; type: string; init: string; decl: string; doc: string };
  const props: Prop[] = [
    { prop: 'open', type: 'boolean', init: 'false', decl: '{ type: Boolean, reflect: true }', doc: 'Open' },
    { prop: 'modal', type: 'boolean', init: 'true', decl: "{ type: Boolean, converter: { fromAttribute: (value: string | null) => value !== 'false' } }", doc: 'Modal (default): focus stays inside, the page behind is inert, and a backdrop shows. modal="false" for an in-page dialog' },
    ...enumAxes.map((a) => ({ prop: a.prop, type: a.options.map(js).join(' | '), init: js(a.defaultValue), decl: `{ type: String, reflect: true, attribute: ${js(attrFor(a.prop))} }`, doc: `Figma: ${a.figma}` })),
    ...booleans.map((b) => ({ prop: b.prop, type: 'boolean', init: String(String(b.p.default) === 'true'), decl: `{ type: Boolean, attribute: ${js(attrFor(b.prop))} }`, doc: `Figma: ${b.p.name}` })),
    ...texts.map((t) => ({ prop: t.prop, type: 'string', init: js(String(t.p.default)), decl: `{ type: String, attribute: ${js(attrFor(t.prop))} }`, doc: `Figma: ${t.p.name}` })),
  ];
  const dataAttrs = enumAxes.map((a) => `data-${a.attr}=\${this.${a.prop}}`);
  const aria = [
    ...(d.alertValue && typeProp ? [`role=\${this.${typeProp} === '${d.alertValue}' ? 'alertdialog' : nothing}`] : []),
    ...(d.title ? ['aria-labelledby="title"'] : []),
    ...(d.body ? ['aria-describedby="body"'] : []),
    ...(d.busyValue && stateProp ? [`aria-busy=\${this.${stateProp} === '${d.busyValue}' ? 'true' : nothing}`] : []),
  ];

  const component = `${header(js(set.name), 'dialog template')}// Visuals come from Figma. Behaviour: WAI-ARIA dialog pattern on a native <dialog> (showModal).
import { LitElement, html, nothing, unsafeCSS } from 'lit';

${usesIcon ? "import { icon } from '../../icons/icon';\n" : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import css from './${name}.css?inline';

export class ${cls} extends LitElement {
  static override styles = [unsafeCSS(':host { display: contents; }'), unsafeCSS(css)];
  static override properties = {
${props.map((p) => `    ${p.prop}: ${p.decl},`).join('\n')}
  };

${props.map((p) => `  /** ${p.doc} */\n  declare ${p.prop}: ${p.type};`).join('\n')}

  constructor() {
    super();
${props.map((p) => `    this.${p.prop} = ${p.init};`).join('\n')}
  }

  private get dialog() {
    return this.renderRoot.querySelector('dialog');
  }

  /** Opens or closes the dialog and fires a composed "open-change" event (detail: the new state). */
  setOpen(open: boolean) {
    if (this.open === open) return;
    this.open = open;
    this.dispatchEvent(new CustomEvent('open-change', { detail: open, bubbles: true, composed: true }));
  }

  override updated() {
    const dialog = this.dialog;
    if (!dialog) return;
    if (this.open && !dialog.open) {
      if (this.modal) dialog.showModal();
      else dialog.show();
    } else if (!this.open && dialog.open) dialog.close();
  }

  private onKeyDown(event: KeyboardEvent) {
    // WAI-ARIA dialog: Escape closes it (modal or not).
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      this.setOpen(false);
    }
  }

  override render() {
    return html\`<dialog class="root" part="root" ${[...aria, ...dataAttrs].join(' ')}
        @keydown=\${this.onKeyDown} @close=\${() => this.setOpen(false)}>
${body}
      </dialog>\`;
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
  type Bind = string | boolean;
  const storyProps = props.filter((p) => !['open', 'modal'].includes(p.prop));
  const isBool = (prop: string) => props.find((p) => p.prop === prop)?.type === 'boolean';
  const el = (over: Record<string, Bind> = {}) => {
    const m = new Map<string, Bind>(storyProps.map((p) => [p.prop, `args.${p.prop}`]));
    for (const [k, v] of Object.entries(over)) m.set(k, v);
    const attrs = [...m].map(([prop, v]) => {
      const n = attrFor(prop);
      if (typeof v === 'boolean') return `?${n}=\${${v}}`;
      if (v.startsWith('args.')) return isBool(prop) ? `?${n}=\${${v}}` : `${n}=\${${v}}`;
      return `${n}=${js(v)}`;
    });
    return `html\`<${tag} open modal="false" ${attrs.join(' ')}></${tag}>\``;
  };
  const overFor = (a: GenericCore['axes'][number], figma: string): Record<string, Bind> => {
    const v = a.values.find((x) => x.figma === figma);
    if (!v || v.role === 'pseudo') return {};
    if (v.role === 'disabled') return { disabled: true };
    return a.options.length > 1 ? { [wcProp(a.prop)]: v.value } : {};
  };
  const titleText = String(core.texts.find((t) => d.title && core.layers.find((l) => l.role === d.title)?.part.refs?.characters === t.p.name)?.p.default ?? '');
  const shadow = `within(canvasElement.querySelector('${tag}')!.shadowRoot as unknown as HTMLElement)`;
  const stories: string[] = [`/** A modal dialog opened from a button. Escape closes it and focus returns to the button. */
export const Default: Story = {
  render: (args) => html\`<button type="button" @click=\${(event: Event) => ((event.target as HTMLElement).nextElementSibling as ${cls}).setOpen(true)}>Open dialog</button>
    <${tag} ${storyProps.map((p) => (isBool(p.prop) ? `?${attrFor(p.prop)}=\${args.${p.prop}}` : `${attrFor(p.prop)}=\${args.${p.prop}}`)).join(' ')}></${tag}>\`,
  play: async ({ canvasElement }) => {
    const host = canvasElement.querySelector('${tag}')!;
    const onOpenChange = fn();
    host.addEventListener('open-change', (event) => onOpenChange((event as CustomEvent<boolean>).detail));
    const trigger = within(canvasElement).getByRole('button', { name: 'Open dialog' });
    await userEvent.click(trigger);
    await host.updateComplete;
    const dialog = ${shadow}.getByRole('dialog'${d.title ? `, { name: ${js(titleText)} }` : ''});
    await expect(dialog).toHaveAttribute('open');
    await expect(host.shadowRoot!.activeElement).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    await host.updateComplete;
    await expect(dialog).not.toHaveAttribute('open');
    await expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await expect(trigger).toHaveFocus();
  },
};`];
  if (d.close) {
    stories.push(`/** The close button closes it. */
export const CloseButton: Story = {
  render: (args) => ${el()},
  play: async ({ canvasElement }) => {
    const host = canvasElement.querySelector('${tag}')!;
    await userEvent.click(${shadow}.getByRole('button', { name: 'Close' }));
    await host.updateComplete;
    await expect(host.open).toBe(false);
  },
};`);
  }
  if (d.alertValue && typeProp) {
    stories.push(`/** Figma Type=Alert is an alertdialog. */
export const AlertRole: Story = {
  args: { ${typeProp}: '${d.alertValue}' },
  render: (args) => ${el()},
  play: async ({ canvasElement }) => {
    await expect(${shadow}.getByRole('alertdialog')).toBeInTheDocument();
  },
};`);
  }
  const sections: { heading: string; story: string }[] = [];
  const names = new Set(['Default', 'CloseButton', 'AlertRole']);
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
    stories.push(`/** Figma ${core.rowAxis.figma} × ${core.colAxis.figma}, as open in-page dialogs. */
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
  const layoutImports = ['matrix', 'row', 'labelled'].filter((f) => stories.some((st) => st.includes(`${f}(`)));
  const storiesFile = `${header(js(set.name), 'dialog template')}import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { expect, fn, userEvent, within } from 'storybook/test';

${layoutImports.length ? `import { ${layoutImports.join(', ')} } from '../../storybook/layout';\n` : ''}import './${tag}';
import type { ${cls} } from './${tag}';

const meta = {
  title: ${js(core.title)},
  component: '${tag}',
  args: { ${storyProps.map((p) => `${p.prop}: ${p.init}`).join(', ')} },
  argTypes: {
${enumAxes.map((a) => `    ${a.prop}: { control: '${a.options.length > 5 ? 'select' : 'inline-radio'}', options: ${js(a.options)}, description: ${js(`Figma: ${a.figma}`)} },`).join('\n')}
  },
  parameters: { figma: { fileKey: ${js(ctx.fileKey)}, nodeId: ${js(set.nodeId)} }, generator: 'dialog' },
} satisfies Meta;

export default meta;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Story = StoryObj<any>;

${stories.join('\n\n')}
`;

  const description = core.description || leadSentence(set.docFrames);
  const mapping = core.mapping.map((m) => ({ ...m, prop: m.prop === '—' || m.prop.includes(' ') ? m.prop.replace('open / defaultOpen / modal / onOpenChange', 'open / modal (event: open-change)').replace(/^children$/, 'default slot').replace(/^footer$/, 'slot="footer"') : m.prop === 'children' ? 'default slot' : m.prop === 'footer' ? 'slot="footer"' : wcProp(m.prop) }));
  const docs = figmaDocsMdx(docTabs(set.docFrames, name), mapping, [...core.assumptions, ...core.gaps], [set], ctx.fileKey);
  const usageContent = `\n  <p>Dialog content.</p>${d.footer ? '\n  <div slot="footer"><button type="button">Done</button></div>' : ''}\n`;
  const files: GeneratedFile[] = [
    { path: `${dir}/${tag}.ts`, content: component },
    { path: `${dir}/${name}.css`, content: core.css },
    { path: `${dir}/${name}.stories.ts`, content: storiesFile },
    { path: `${dir}/${name}.mdx`, content: mdx(name, description, sections, usage(o, tag, ' open', usageContent, 'open-change'), docs) },
  ];
  return {
    files,
    tags: [tag],
    module: tag,
    typings: [{ tag, className: cls, props: props.map((p) => ({ name: p.prop, type: p.type })) }],
    notes: [],
  };
}
