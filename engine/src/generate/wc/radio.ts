/**
 * Radio behaviour packs as Lit elements: control, field and group.
 *
 * Native radio inputs only group within one DOM tree, and every element here has its own
 * shadow root. So each control keeps a native <input type="radio"> (role, checked state,
 * focus, Space, form value through ElementInternals), and the group does what the browser
 * would do across trees: it collects its radios from a composed "ds-radio-register" event,
 * keeps one selected, moves the selection with the arrow keys, and gives Tab a single stop
 * (roving tabindex), as in the WAI-ARIA radio group pattern.
 */
import { docTabs, leadSentence, pascal, type GeneratedFile, type TemplateContext } from '../templates/common.ts';
import { axisControl, axisData, axisDefault, axisType, isIcon, SHAPES, type GenericCore, type InstanceRef, type LayerInfo } from '../templates/generic.ts';
import type { IRPart } from '../../ir/types.ts';
import { attrFor, classFor, figmaDocsMdx, header, mdx, tagFor, usage, wcProp, wcText, type WcOptions, type WcResult } from './components.ts';

const js = (v: unknown) => JSON.stringify(v);

export function wcRadio(ctx: TemplateContext, name: string, core: GenericCore, o: WcOptions, instance: (part: IRPart) => InstanceRef | undefined, tagOf: (component: string) => string): WcResult {
  const r = core.radio!;
  const rl = core.radioLayers ?? {};
  const tag = tagFor(o.prefix, name);
  const cls = classFor(o.prefix, name);
  const dir = `src/components/${name}`;
  const { set, hasDisabled } = core;
  const enumAxes = core.axes.filter((a) => a.options.length > 1 && a !== r.axis).map((a) => ({ ...a, prop: wcProp(a.prop) }));
  const stateAxis = enumAxes.find((a) => a.prop === 'state');
  const has = (v: string) => Boolean(stateAxis?.options.includes(v));
  const copy = r.copy ?? '';
  const imports = new Set<string>();
  let usesIcon = false;
  const children = (parent: string) => core.layers.filter((l) => l.parent === parent);

  // Layers -> Lit template (the generic renderer's rules, plus the radio hooks).
  const render = (l: LayerInfo, indent: string): string => {
    const p = l.part;
    const c = `class="${l.role}"`;
    let el: string;
    if (p.type === 'TEXT' && (l.role === rl.label || l.role === rl.groupLabel)) {
      el = `<span ${c}${l.role === rl.groupLabel ? ' id="label"' : ''}>\${this.label ?? ${js(p.text ?? '')}}</span>`;
    } else if (p.type === 'TEXT') {
      el = `<span ${c}>\${${wcText(l, js(p.text ?? ''))}}</span>`;
    } else if (p.type === 'INSTANCE') {
      const ic = p.instanceOf ? ctx.icons.get(p.instanceOf) : undefined;
      const one = (part: IRPart): string | undefined => {
        const n = !isIcon(part) && part.instanceComponentId ? instance(part) : undefined;
        if (!n || n.component === name) return undefined;
        const ntag = tagOf(n.component);
        imports.add(`import '../${n.component}/${ntag}';`);
        const attrs = n.props.map((x) => (x.kind === 'force-state' ? `data-force-state=${js(x.value)}` : x.prop === 'defaultChecked' ? '?checked=${true}' : `.${wcProp(x.prop)}=\${${js(x.value)}}`));
        if (l.role === rl.control) {
          const fwd = rl.forwardStates?.length && stateAxis ? ` state=\${(${js(rl.forwardStates)} as string[]).includes(this.${stateAxis.prop}) ? this.${stateAxis.prop} : 'enabled'}` : '';
          return `<span ${c}><${ntag} accessible-label=\${typeof this.label === 'string' ? this.label : ${js(copy)}} name=\${this.name ?? nothing} .value=\${this.value} ?checked=\${this.checked} ?disabled=\${this.disabled}${fwd}></${ntag}></span>`;
        }
        return `<span ${c}><${ntag}${attrs.length ? ' ' + attrs.join(' ') : ''}></${ntag}></span>`;
      };
      if (ic) {
        usesIcon = true;
        el = `<span ${c} aria-hidden="true">\${icon(${js(ic.name)})}</span>`;
      } else {
        const rendered = [p, ...(l.copies ?? [])].map(one).filter(Boolean);
        el = rendered.length ? rendered.join(`\n${indent}`) : `<span ${c} aria-hidden="true"></span>`;
      }
    } else if (SHAPES.has(p.type)) {
      el = `<span ${c} aria-hidden="true"></span>`;
    } else {
      const kids = children(l.path);
      const box = l.role === rl.row ? 'label' : r.kind === 'control' ? 'span' : 'div';
      const onLabel = l.role === rl.row ? ' @click=${this.onLabelClick}' : '';
      const inner = kids.map((k) => render(k, indent + '  ')).join('\n');
      el = l.role === rl.items
        ? `<${box} ${c}><slot>\n${inner}\n${indent}</slot></${box}>`
        : kids.length ? `<${box} ${c}${onLabel}>\n${inner}\n${indent}</${box}>` : `<${box} ${c}${onLabel}></${box}>`;
    }
    return `${indent}${el}`;
  };
  const body = children('').map((l) => render(l, '        ')).join('\n');

  // Properties
  type Prop = { prop: string; type: string; init: string; decl: string; doc: string };
  const axisProps: Prop[] = enumAxes.map((a) => ({ prop: a.prop, type: axisType(a, js), init: axisDefault(a, js), decl: `{ type: ${a.boolean ? 'Boolean' : 'String'}, reflect: true, attribute: ${js(attrFor(a.prop))} }`, doc: `Figma: ${a.figma}` }));
  const disabled: Prop = { prop: 'disabled', type: 'boolean', init: 'false', decl: '{ type: Boolean, reflect: true }', doc: hasDisabled ? 'Figma: State=Disabled' : 'Disabled' };
  const props: Prop[] =
    r.kind === 'control' ? [
      { prop: 'checked', type: 'boolean', init: 'false', decl: '{ type: Boolean, reflect: true }', doc: `Selected. Figma: ${r.axis?.figma}` },
      { prop: 'name', type: 'string | undefined', init: 'undefined', decl: '{ type: String, reflect: true }', doc: 'Form field name (a group sets it)' },
      { prop: 'value', type: 'string', init: "'on'", decl: '{ type: String }', doc: 'Form value when selected' },
      { prop: 'accessibleLabel', type: 'string | undefined', init: 'undefined', decl: "{ type: String, attribute: 'accessible-label' }", doc: 'Accessible name when no field labels it' },
      ...axisProps, disabled,
      { prop: 'tabStop', type: 'boolean', init: 'true', decl: '{ type: Boolean, attribute: false }', doc: 'Set by the group: whether Tab stops here (roving tabindex)' },
      { prop: 'groupReadOnly', type: 'boolean', init: 'false', decl: '{ type: Boolean, attribute: false }', doc: 'Set by a read-only group' },
    ]
    : r.kind === 'field' ? [
      { prop: 'label', type: 'string | undefined', init: 'undefined', decl: '{ type: String }', doc: `Figma: the label text (${js(copy)})` },
      { prop: 'name', type: 'string | undefined', init: 'undefined', decl: '{ type: String }', doc: 'Passed to the radio' },
      { prop: 'value', type: 'string', init: "'on'", decl: '{ type: String }', doc: 'Passed to the radio' },
      { prop: 'checked', type: 'boolean', init: 'false', decl: '{ type: Boolean }', doc: 'Initially selected' },
      ...axisProps, disabled,
    ]
    : [
      { prop: 'label', type: 'string | undefined', init: 'undefined', decl: '{ type: String }', doc: `Figma: the group label (${js(copy)})` },
      { prop: 'name', type: 'string | undefined', init: 'undefined', decl: '{ type: String }', doc: 'Shared name for the radios inside' },
      { prop: 'value', type: 'string | undefined', init: 'undefined', decl: '{ type: String, reflect: true }', doc: 'Selected value' },
      ...axisProps,
      { ...disabled, doc: 'Disables every radio inside' },
    ];
  const dataAttrs = [...enumAxes.map((a) => `data-${a.attr}=\${${axisData(a, `this.${a.prop}`)}}`), '?data-disabled=${this.disabled}', 'data-force-state=${this.forceState ?? nothing}'];
  const readOnlyExpr = `${has('read-only') && stateAxis ? `this.${stateAxis.prop} === 'read-only' || ` : ''}this.groupReadOnly`;

  const classBody =
    r.kind === 'control' ? `  private readonly internals = this.attachInternals();

  override connectedCallback() {
    super.connectedCallback();
    // A group (or a field inside one) collects its radios through this composed event.
    this.dispatchEvent(new CustomEvent('ds-radio-register', { detail: this, bubbles: true, composed: true }));
    this.addEventListener('click', this.onHostClick);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.onHostClick);
  }

  override updated() {
    this.internals.setFormValue(this.checked ? this.value : null);
  }

  /** A <label> around this element activates it with a click on the host. */
  private readonly onHostClick = (event: Event) => {
    if (event.composedPath()[0] === this) this.select();
  };

  /** Selects this radio (as a click would). */
  select() {
    if (this.disabled || ${readOnlyExpr}) return;
    if (!this.checked) {
      this.checked = true;
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
    this.dispatchEvent(new CustomEvent('ds-radio-select', { detail: this, bubbles: true, composed: true }));
  }

  private onClick(event: Event) {
    if (${readOnlyExpr}) event.preventDefault();
  }

  private onKeyDown(event: KeyboardEvent) {
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    if (${readOnlyExpr}) return;
    this.dispatchEvent(new CustomEvent('ds-radio-move', { detail: { from: this, delta }, bubbles: true, composed: true }));
  }

  override render() {
    return html\`<span class="root" part="root" ${dataAttrs.join(' ')}>
        <input type="radio" class="input" .checked=\${live(this.checked)} ?disabled=\${this.disabled} name=\${this.name ?? nothing} .value=\${this.value}
          tabindex=\${this.tabStop ? 0 : -1} aria-label=\${this.accessibleLabel ?? nothing}${has('invalid') && stateAxis ? ` aria-invalid=\${this.${stateAxis.prop} === 'invalid' ? 'true' : nothing}` : ''}
          @change=\${() => this.select()} @click=\${this.onClick} @keydown=\${this.onKeyDown} />
${body}
      </span>\`;
  }`
    : r.kind === 'field' ? `  /** Clicking the label text selects the radio (the radio's input sits in another shadow root). */
  private onLabelClick(event: Event) {
    const control = this.renderRoot.querySelector('${r.control ? tagOf(r.control) : ''}') as (HTMLElement & { select(): void }) | null;
    if (!control || event.composedPath().includes(control)) return;
    event.preventDefault();
    control.select();
    control.focus();
  }

  override render() {
    return html\`<div class="root" part="root" ${dataAttrs.join(' ')}>
${body}
      </div>\`;
  }`
    : `  /** The radios inside, in registration (document) order. */
  private radios: Radio[] = [];
  private readonly uid = \`ds-radio-\${Math.random().toString(36).slice(2, 8)}\`;

  constructor() {
    super();
${props.map((p) => `    this.${p.prop} = ${p.init};`).join('\n')}
    this.addEventListener('ds-radio-register', (event) => {
      event.stopPropagation();
      const radio = (event as CustomEvent<Radio>).detail;
      if (!this.radios.includes(radio)) this.radios.push(radio);
      this.configure(radio);
      queueMicrotask(() => this.syncTabStops());
    });
    this.addEventListener('ds-radio-select', (event) => {
      event.stopPropagation();
      const selected = (event as CustomEvent<Radio>).detail;
      for (const radio of this.live()) if (radio !== selected) radio.checked = false;
      if (this.value !== selected.value) {
        this.value = selected.value;
        this.dispatchEvent(new CustomEvent('value-change', { detail: selected.value, bubbles: true, composed: true }));
      }
      this.syncTabStops();
    });
    this.addEventListener('ds-radio-move', (event) => {
      event.stopPropagation();
      const { from, delta } = (event as CustomEvent<{ from: Radio; delta: number }>).detail;
      const enabled = this.live().filter((radio) => !radio.disabled);
      const next = enabled[(enabled.indexOf(from) + delta + enabled.length) % enabled.length];
      if (!next) return;
      next.select();
      next.focus();
    });
  }

  private live() {
    return this.radios.filter((radio) => radio.isConnected);
  }

  private configure(radio: Radio) {
    if (!radio.name) radio.name = this.name ?? this.uid;
    if (this.value !== undefined) radio.checked = radio.value === this.value;
    if (this.disabled) radio.disabled = true;
    radio.groupReadOnly = ${has('read-only') && stateAxis ? `this.${stateAxis.prop} === 'read-only'` : 'false'};
  }

  /** WAI-ARIA radio group: one Tab stop, on the selected radio (or the first enabled one). */
  private syncTabStops() {
    const radios = this.live();
    const stop = radios.find((radio) => radio.checked && !radio.disabled) ?? radios.find((radio) => !radio.disabled);
    for (const radio of radios) radio.tabStop = radio === stop;
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has('value') || changed.has('disabled') || changed.has('name')${stateAxis ? ` || changed.has('${stateAxis.prop}')` : ''}) {
      for (const radio of this.live()) this.configure(radio);
      this.syncTabStops();
    }
  }

  override render() {
    return html\`<div class="root" part="root" role="radiogroup" aria-labelledby="label"${has('invalid') && stateAxis ? ` aria-invalid=\${this.${stateAxis.prop} === 'invalid' ? 'true' : nothing}` : ''}${has('read-only') && stateAxis ? ` aria-readonly=\${this.${stateAxis.prop} === 'read-only' ? 'true' : nothing}` : ''} aria-disabled=\${this.disabled ? 'true' : nothing} ${dataAttrs.join(' ')}>
${body}
      </div>\`;
  }`;

  const component = `${header(js(set.name), 'radio template')}// Visuals come from Figma. Behaviour: WAI-ARIA radio group pattern (native radio inputs; the group manages selection, arrow keys and the Tab stop across shadow roots).
import { LitElement, html, nothing, unsafeCSS } from 'lit';
${r.kind === 'control' ? "import { live } from 'lit/directives/live.js';\n" : ''}
${usesIcon ? "import { icon } from '../../icons/icon';\n" : ''}${[...imports].join('\n')}${imports.size ? '\n' : ''}import css from './${name}.css?inline';
${r.kind === 'group' ? `
/** What the group needs from a radio control. */
type Radio = HTMLElement & { checked: boolean; value: string; name?: string; disabled: boolean; tabStop: boolean; groupReadOnly: boolean; select(): void };
` : ''}
export class ${cls} extends LitElement {
${r.kind === 'control' ? '  static formAssociated = true;\n  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true };\n' : ''}  static override styles = [unsafeCSS(':host { display: contents; }'), unsafeCSS(css)];
  static override properties = {
${props.map((p) => `    ${p.prop}: ${p.decl},`).join('\n')}
    forceState: { type: String, attribute: 'data-force-state' },
  };

${props.map((p) => `  /** ${p.doc} */\n  declare ${p.prop}: ${p.type};`).join('\n')}
  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */
  declare forceState: string | undefined;
${r.kind === 'group' ? '' : `
  constructor() {
    super();
${props.map((p) => `    this.${p.prop} = ${p.init};`).join('\n')}
  }
`}
${classBody}
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
  const settable = props.filter((p) => !['tabStop', 'groupReadOnly'].includes(p.prop));
  const isBool = (prop: string) => settable.find((p) => p.prop === prop)?.type === 'boolean';
  const el = (over: Record<string, Bind> = {}) => {
    const m = new Map<string, Bind>(settable.filter((p) => !['name', 'value'].includes(p.prop)).map((p) => [p.prop, `args.${p.prop}`]));
    let force: string | undefined;
    for (const [k, v] of Object.entries(over)) {
      if (typeof v === 'object') force = v.force;
      else m.set(k, v);
    }
    const attrs = [...m].map(([prop, v]) => {
      const n = attrFor(prop);
      if (typeof v === 'boolean') return `?${n}=\${${v}}`;
      if (typeof v !== 'string') return '';
      if (v.startsWith('args.')) return isBool(prop) ? `?${n}=\${${v}}` : `${n}=\${${v} ?? nothing}`;
      return `${n}=${js(v)}`;
    });
    if (force) attrs.push(`data-force-state=${js(force)}`);
    return `html\`<${tag} ${attrs.filter(Boolean).join(' ')}></${tag}>\``;
  };
  const overFor = (a: GenericCore['axes'][number], figma: string): Record<string, Bind> => {
    const v = a.values.find((x) => x.figma === figma);
    if (!v) return {};
    if (a === r.axis) return { checked: v.value === r.on };
    if (v.role === 'pseudo') return { _force: { force: v.state! } };
    if (v.role === 'disabled') return { disabled: true };
    return a.options.length > 1 ? { [wcProp(a.prop)]: a.boolean ? v.value === 'true' : v.value } : {};
  };
  const shadow = (root: string, sel: string) => `(${root}.querySelector(${js(sel)})!.shadowRoot!)`;
  const controlTag = r.control ? tagOf(r.control) : undefined;
  const fieldTag = rl.fieldComponent ? tagOf(rl.fieldComponent) : undefined;
  const defaultStory =
    r.kind === 'control' ? `export const Default: Story = {
  play: async ({ canvasElement }) => {
    const host = canvasElement.querySelector('${tag}')!;
    const onChange = fn();
    host.addEventListener('change', onChange);
    const radio = within(shadowOf(canvasElement, '${tag}') as unknown as HTMLElement).getByRole('radio', { name: ${js(r.label)} });
    await expect(radio).not.toBeChecked();
    await userEvent.click(radio);
    await expect(radio).toBeChecked();
    await expect(host.checked).toBe(true);
    await expect(onChange).toHaveBeenCalledTimes(1);
  },
};${hasDisabled ? `

/** Disabled: cannot be selected. */
export const DisabledDoesNotSelect: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const radio = within(shadowOf(canvasElement, '${tag}') as unknown as HTMLElement).getByRole('radio', { name: ${js(r.label)} });
    await expect(radio).toBeDisabled();
    await userEvent.click(radio, { pointerEventsCheck: 0 });
    await expect(radio).not.toBeChecked();
  },
};` : ''}`
    : r.kind === 'field' && controlTag ? `export const Default: Story = {
  play: async ({ canvasElement }) => {
    const field = shadowOf(canvasElement, '${tag}');
    // The text is inside the <label>: clicking it selects the radio.
    await userEvent.click(within(field as unknown as HTMLElement).getByText(${js(copy)}));
    const radio = within(${shadow('field', controlTag)} as unknown as HTMLElement).getByRole('radio', { name: ${js(copy)} });
    await expect(radio).toBeChecked();
  },
};`
    : r.kind === 'group' && controlTag && fieldTag ? `export const Default: Story = {
  play: async ({ canvasElement }) => {
    const group = shadowOf(canvasElement, '${tag}');
    await expect(within(group as unknown as HTMLElement).getByRole('radiogroup', { name: ${js(copy)} })).toBeInTheDocument();
    const controls = [...group.querySelectorAll('${fieldTag}')].map((f) => f.shadowRoot!.querySelector('${controlTag}')!);
    const radios = controls.map((c) => c.shadowRoot!.querySelector('input')!);
    await expect(radios.length).toBeGreaterThan(1);
    await userEvent.click(radios[0]!);
    await expect(radios[0]).toBeChecked();
    // One Tab stop: only the selected radio is in the tab order.
    await expect(radios.map((radio) => radio.tabIndex)).toEqual(radios.map((_, i) => (i === 0 ? 0 : -1)));
    // WAI-ARIA radio group: arrow keys move focus and selection.
    await userEvent.keyboard('{ArrowDown}');
    await expect(radios[1]).toBeChecked();
    await expect(radios[0]).not.toBeChecked();
    await expect(controls[1]!.shadowRoot!.activeElement).toBe(radios[1]);
  },
};`
    : 'export const Default: Story = {};';
  const stories: string[] = [defaultStory];
  const sections: { heading: string; story: string }[] = [];
  const names = new Set(['Default', 'DisabledDoesNotSelect']);
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
  const layoutImports = ['matrix', 'row', 'labelled', 'shadowOf'].filter((f) => stories.some((st) => st.includes(`${f}(`)));
  const args = settable.filter((p) => !['name', 'value'].includes(p.prop)).map((p) => `${p.prop}: ${p.prop === 'accessibleLabel' ? js(r.label) : p.init}`);
  const storiesFile = `${header(js(set.name), 'radio template')}import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html, nothing } from 'lit';
import { expect, ${r.kind === 'control' ? 'fn, ' : ''}userEvent, within } from 'storybook/test';

${layoutImports.length ? `import { ${layoutImports.join(', ')} } from '../../storybook/layout';\n` : ''}import './${tag}';

const meta = {
  title: ${js(core.title)},
  component: '${tag}',
  args: { ${args.join(', ')} },
  argTypes: {
${enumAxes.map((a) => `    ${a.prop}: ${axisControl(a, js)},`).join('\n')}
  },
  render: (args) => ${el()},
  parameters: { figma: { fileKey: ${js(ctx.fileKey)}, nodeId: ${js(set.nodeId)} }, generator: 'radio' },
} satisfies Meta;

export default meta;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Story = StoryObj<any>;

${stories.join('\n\n')}
`;

  const description = core.description || leadSentence(set.docFrames);
  const mapping = core.mapping.map((m) => ({ ...m, prop: m.prop === '—' || m.prop.includes(' ') ? (m.prop === 'checked / defaultChecked' ? 'checked' : m.prop.replace(/ \/ defaultChecked| \/ onChange| \/ defaultValue| \/ onValueChange/g, '')) : wcProp(m.prop) }));
  const usageAttrs = r.kind === 'control' ? ` accessible-label=${js(r.label)} name="choice" value="a"` : r.kind === 'field' ? ` label=${js(copy)} name="choice" value="a"` : ` label=${js(copy)} name="choice"`;
  const usageContent = r.kind === 'group' && fieldTag ? `\n  <${fieldTag} label="A" value="a"></${fieldTag}>\n  <${fieldTag} label="B" value="b"></${fieldTag}>\n` : '';
  const docs = figmaDocsMdx(docTabs(set.docFrames, name), mapping, [...core.assumptions, ...core.gaps], [set], ctx.fileKey);
  const files: GeneratedFile[] = [
    { path: `${dir}/${tag}.ts`, content: component },
    { path: `${dir}/${name}.css`, content: core.css },
    { path: `${dir}/${name}.stories.ts`, content: storiesFile },
    { path: `${dir}/${name}.mdx`, content: mdx(name, description, sections, usage(o, tag, usageAttrs, usageContent, r.kind === 'group' ? 'value-change' : 'change'), docs) },
  ];
  return {
    files,
    tags: [tag],
    module: tag,
    typings: [{ tag, className: cls, props: settable.map((p) => ({ name: p.prop, type: p.type })) }],
    notes: [],
  };
}
