/**
 * Archetype "selection.binary" (Checkbox + CheckboxGroup): a native checkbox input under a
 * custom box, behaviour from the WAI-ARIA checkbox pattern. Figma supplies three sets:
 * the control (box), the field (labels and messages) and the group (legend and layout).
 */
import type { IRComponentSet } from '../../ir/types.ts';
import { generateStyles, type RoleDef, type StateAxis, type StyleModel } from '../styles.ts';
import { axisDefault, axisOptions, docsJson, forced, kebab, mdxPage, partAt, q, sampleText, type ComponentReport, type TemplateContext, type TemplateResult } from './common.ts';

const part = (test: RegExp, extra: Partial<RoleDef> & Pick<RoleDef, 'role' | 'kind'>): RoleDef => ({
  ...extra,
  find: (v) => {
    const p = partAt(v, test);
    return p ? { style: p.style, part: p } : undefined;
  },
});

function controlModel(set: IRComponentSet): StyleModel {
  const type: StateAxis = { figma: 'Type', states: {} };
  for (const t of axisOptions(set, 'Type')) {
    const k = t.toLowerCase();
    const err = k.startsWith('error') ? '[data-invalid]' : '';
    const sel = k.includes('indeterminate') ? ':has(> .input:indeterminate)' : k.includes('unselected') ? '' : k.includes('selected') ? ':has(> .input:checked)' : '';
    type.states[t] = err || sel ? { target: 'root', selector: err + sel } : null;
  }
  const state: StateAxis = { figma: 'State', states: {} };
  for (const s of axisOptions(set, 'State')) {
    const k = s.toLowerCase();
    state.states[s] = /enabled|default/.test(k) ? null
      : /hover/.test(k) ? forced('hover', ':hover')
      : /focus/.test(k) ? forced('focus', ':has(> .input:focus-visible)')
      : /press/.test(k) ? forced('pressed', ':active')
      : /disabled/.test(k) ? { target: 'root', selector: ':has(> .input:disabled)' }
      : 'skip';
  }
  return {
    rootClass: 'control',
    axes: [{ figma: 'Size', attr: 'size', values: Object.fromEntries(axisOptions(set, 'Size').map((o) => [o, kebab(o)])) }],
    stateAxes: [type, state],
    roles: [
      { role: 'root', kind: 'box', fixedSize: true, find: (v) => ({ style: v.style }) },
      part(/^_focus-ring$/, { role: 'focusRing', kind: 'box', fixedSize: true, presence: true, display: 'block', parent: 'root' }),
      part(/^_box$/, { role: 'box', kind: 'box', fixedSize: true, parent: 'root', hint: ['control', 'interactive'] }),
      part(/^_mark$/, { role: 'mark', kind: 'icon', presence: true, parent: 'root' }),
    ],
  };
}

function fieldModel(set: IRComponentSet): StyleModel {
  const state: StateAxis = { figma: 'State', states: {} };
  for (const s of axisOptions(set, 'State')) {
    const k = s.toLowerCase();
    state.states[s] = /enabled|default/.test(k) ? null
      : /focus/.test(k) ? forced('focus', ':has(.input:focus-visible)')
      : /invalid|error/.test(k) ? { target: 'root', selector: '[data-invalid]' }
      : /warning/.test(k) ? { target: 'root', selector: '[data-warning]' }
      : /read/.test(k) ? { target: 'root', selector: '[data-readonly]' }
      : /disabled/.test(k) ? { target: 'root', selector: '[data-disabled]' }
      : 'skip';
  }
  const type: StateAxis = { figma: 'Type', states: Object.fromEntries(axisOptions(set, 'Type').map((t) => [t, /^unselected$/i.test(t) ? null : { target: 'root', selector: /indeterminate/i.test(t) ? ':has(.input:indeterminate)' : ':has(.input:checked)' }])) };
  return {
    rootClass: 'field',
    axes: [],
    stateAxes: [type, state],
    roles: [
      { role: 'root', kind: 'box', find: (v) => ({ style: v.style }) },
      part(/^_label$/, { role: 'heading', kind: 'text', parent: 'root' }),
      part(/^_description$/, { role: 'description', kind: 'text', parent: 'root', includeHidden: true }),
      part(/^_checkbox-row$/, { role: 'row', kind: 'box', parent: 'root' }),
      part(/^_checkbox-row\/_value$/, { role: 'valueText', kind: 'text', parent: 'row' }),
      part(/^_helper$/, { role: 'helper', kind: 'text', parent: 'root', includeHidden: true }),
      part(/^_error-row$/, { role: 'errorRow', kind: 'box', parent: 'root', includeHidden: true }),
      part(/^_error-row\/Icon/i, { role: 'errorIcon', kind: 'icon', parent: 'errorRow', includeHidden: true }),
      part(/^_error-row\/(?!Icon)/i, { role: 'errorText', kind: 'text', parent: 'errorRow', includeHidden: true }),
      part(/^_warning-row$/, { role: 'warningRow', kind: 'box', parent: 'root', includeHidden: true }),
      part(/^_warning-row\/Icon/i, { role: 'warningIcon', kind: 'icon', parent: 'warningRow', includeHidden: true }),
      part(/^_warning-row\/(?!Icon)/i, { role: 'warningText', kind: 'text', parent: 'warningRow', includeHidden: true }),
    ],
  };
}

function groupModel(set: IRComponentSet): StyleModel {
  const state: StateAxis = { figma: 'State', states: {} };
  for (const s of axisOptions(set, 'State')) {
    const k = s.toLowerCase();
    state.states[s] = /enabled|default/.test(k) ? null
      : /invalid|error/.test(k) ? { target: 'root', selector: '[data-invalid]' }
      : /warning/.test(k) ? { target: 'root', selector: '[data-warning]' }
      : /read/.test(k) ? { target: 'root', selector: '[data-readonly]' }
      : 'skip';
  }
  return {
    rootClass: 'group',
    axes: [{ figma: 'Orientation', attr: 'orientation', values: Object.fromEntries(axisOptions(set, 'Orientation').map((o) => [o, kebab(o)])) }],
    stateAxes: [state],
    roles: [
      { role: 'root', kind: 'box', find: (v) => ({ style: v.style }) },
      part(/^_group-label$/, { role: 'legend', kind: 'text', parent: 'root' }),
      part(/^_items$/, { role: 'items', kind: 'box', parent: 'root' }),
      part(/^_g-error$/, { role: 'groupErrorRow', kind: 'box', parent: 'root', includeHidden: true }),
      part(/^_g-error\/Icon/i, { role: 'groupErrorIcon', kind: 'icon', parent: 'groupErrorRow', includeHidden: true }),
      part(/^_g-error\/(?!Icon)/i, { role: 'groupErrorText', kind: 'text', parent: 'groupErrorRow', includeHidden: true }),
      part(/^_g-warning$/, { role: 'groupWarningRow', kind: 'box', parent: 'root', includeHidden: true }),
      part(/^_g-warning\/Icon/i, { role: 'groupWarningIcon', kind: 'icon', parent: 'groupWarningRow', includeHidden: true }),
      part(/^_g-warning\/(?!Icon)/i, { role: 'groupWarningText', kind: 'text', parent: 'groupWarningRow', includeHidden: true }),
    ],
  };
}

const iconName = (ctx: TemplateContext, set: IRComponentSet, test: RegExp) => {
  const figma = set.variants.map((v) => partAt(v, test)?.instanceOf).find(Boolean);
  return figma ? ctx.icons.get(figma)?.name : undefined;
};

export function checkboxTemplate(ctx: TemplateContext, name: string): TemplateResult {
  const control = ctx.sets.control;
  const field = ctx.sets.field;
  const group = ctx.sets.group;
  if (!control || !field) throw new Error(`${name}: the checkbox template needs "control" and "field" component sets`);
  const dir = `src/components/${name}`;
  const groupName = `${name}Group`;

  const parts = [generateStyles(control.variants, controlModel(control), ctx.resolver), generateStyles(field.variants, fieldModel(field), ctx.resolver)];
  if (group) parts.push(generateStyles(group.variants, groupModel(group), ctx.resolver));

  const css = `/* Generated by ds-sync from Figma ${[control, field, group].filter(Boolean).map((s) => `"${s!.name}" (${s!.nodeId})`).join(', ')}. Do not edit by hand. */
.field { display: flex; box-sizing: border-box; }
.row { display: flex; align-items: center; cursor: pointer; }
.control { position: relative; display: inline-flex; flex: none; box-sizing: border-box; }
.input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: inherit; z-index: 1; }
.box { position: absolute; inset: 0; box-sizing: border-box; }
.mark { position: absolute; inset: 0; align-items: center; justify-content: center; pointer-events: none; }
.focusRing { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); box-sizing: border-box; pointer-events: none; }
.errorRow, .warningRow, .groupErrorRow, .groupWarningRow { display: flex; align-items: center; }
.errorIcon, .warningIcon, .groupErrorIcon, .groupWarningIcon { display: inline-flex; flex: none; }
.field[data-disabled] .row, .field[data-readonly] .row { cursor: default; }
.group { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; }
.legend { padding: 0; }
.items { display: flex; }

${parts.map((p) => p.css).join('\n')}`;

  const checkIcon = iconName(ctx, control, /^_mark$/) ?? iconName(ctx, control, /mark/);
  const minusIcon = control.variants.filter((v) => /indeterminate/i.test(v.values.Type ?? '')).map((v) => partAt(v, /^_mark$/)?.instanceOf).find(Boolean);
  const checkFigma = control.variants.filter((v) => /^selected$/i.test(v.values.Type ?? '')).map((v) => partAt(v, /^_mark$/)?.instanceOf).find(Boolean);
  const icons = {
    check: checkFigma ? ctx.icons.get(checkFigma)?.name : checkIcon,
    minus: minusIcon ? ctx.icons.get(minusIcon)?.name : undefined,
    error: iconName(ctx, field, /^_error-row\/Icon/i),
    warning: iconName(ctx, field, /^_warning-row\/Icon/i),
    groupError: group ? iconName(ctx, group, /^_g-error\/Icon/i) : undefined,
    groupWarning: group ? iconName(ctx, group, /^_g-warning\/Icon/i) : undefined,
  };
  const sizes = axisOptions(control, 'Size');
  const defaultSize = kebab(axisDefault(control, 'Size'));
  const iconTag = (key: keyof typeof icons) => (icons[key] ? `<Icon name="${icons[key]}" />` : 'null');

  const tsx = `// Generated by ds-sync from Figma "${control.name}", "${field.name}"${group ? `, "${group.name}"` : ''}. Do not edit by hand.
import { createContext, useContext, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { Icon } from '../../icons/Icon';
import styles from './${name}.module.css';

const GroupContext = createContext<{ readOnly?: boolean; disabled?: boolean }>({});

export interface ${name}Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Figma: ${control.name} Size. Default ${defaultSize}. */
  size?: ${sizes.map((s) => q(kebab(s))).join(' | ')};
  /** Figma: ${field.name} Value. Text next to the box. */
  label?: ReactNode;
  /** Figma: ${field.name} Label (Has label). A heading above the box. */
  heading?: ReactNode;
  /** Figma: ${field.name} Has description. */
  description?: ReactNode;
  /** Figma: ${field.name} Has helper. */
  helperText?: ReactNode;
  /** Figma: ${control.name} Type=Indeterminate. */
  indeterminate?: boolean;
  /** Figma: State=Invalid. The error message shown under the checkbox (also marks it invalid). */
  error?: ReactNode;
  /** Figma: ${control.name} Type=Error-*. Marks the box invalid without a message (use inside a group that shows one). */
  invalid?: boolean;
  /** Figma: State=Warning. */
  warning?: ReactNode;
  /** Figma: State=Read-Only. */
  readOnly?: boolean;
  /** Renders a pseudo state statically for docs and visual tests: "hover", "pressed" or "focus". */
  'data-force-state'?: string;
}

export function ${name}({ size = ${q(defaultSize)}, label, heading, description, helperText, indeterminate = false, error, invalid, warning, readOnly, disabled, id, className, onClick, 'data-force-state': forceState, ...rest }: ${name}Props) {
  const ctx = useContext(GroupContext);
  const isReadOnly = readOnly ?? ctx.readOnly;
  const isDisabled = disabled ?? ctx.disabled;
  const autoId = useId();
  const inputId = id ?? autoId;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const isInvalid = Boolean(error) || Boolean(invalid);
  const descriptionId = description ? \`\${inputId}-description\` : undefined;
  const messageId = error || warning || helperText ? \`\${inputId}-message\` : undefined;
  const describedBy = [descriptionId, messageId].filter(Boolean).join(' ') || undefined;
  return (
    <div
      className={[styles.field, className].filter(Boolean).join(' ')}
      data-invalid={isInvalid ? '' : undefined}
      data-warning={warning && !isInvalid ? '' : undefined}
      data-readonly={isReadOnly ? '' : undefined}
      data-disabled={isDisabled ? '' : undefined}
      data-force-state={forceState}
    >
      {heading && <span className={styles.heading}>{heading}</span>}
      {description && <span id={descriptionId} className={styles.description}>{description}</span>}
      <label className={styles.row} htmlFor={inputId}>
        <span className={styles.control} data-size={size} data-invalid={isInvalid ? '' : undefined} data-force-state={forceState}>
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            className={styles.input}
            disabled={isDisabled}
            aria-invalid={isInvalid || undefined}
            aria-readonly={isReadOnly || undefined}
            aria-describedby={describedBy}
            onClick={(e) => {
              if (isReadOnly) e.preventDefault();
              onClick?.(e);
            }}
            {...rest}
          />
          <span className={styles.focusRing} aria-hidden="true" />
          <span className={styles.box} aria-hidden="true" />
          <span className={styles.mark} aria-hidden="true">{indeterminate ? ${iconTag('minus')} : ${iconTag('check')}}</span>
        </span>
        {label && <span className={styles.valueText}>{label}</span>}
      </label>
      {helperText && !error && !warning && <span id={messageId} className={styles.helper}>{helperText}</span>}
      {error && (
        <span id={messageId} className={styles.errorRow}>
          <span className={styles.errorIcon} aria-hidden="true">${iconTag('error')}</span>
          <span className={styles.errorText}>{error}</span>
        </span>
      )}
      {warning && !error && (
        <span id={messageId} className={styles.warningRow}>
          <span className={styles.warningIcon} aria-hidden="true">${iconTag('warning')}</span>
          <span className={styles.warningText}>{warning}</span>
        </span>
      )}
    </div>
  );
}
${group ? `
export interface ${groupName}Props {
  /** Figma: ${group.name} group label. */
  legend: ReactNode;
  /** Figma: ${group.name} Orientation. Default ${kebab(axisDefault(group, 'Orientation'))}. */
  orientation?: ${axisOptions(group, 'Orientation').map((o) => q(kebab(o))).join(' | ')};
  /** Figma: State=Invalid. */
  error?: ReactNode;
  /** Figma: State=Warning. */
  warning?: ReactNode;
  /** Figma: State=Read-Only. Applies to every checkbox inside. */
  readOnly?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function ${groupName}({ legend, orientation = ${q(kebab(axisDefault(group, 'Orientation')))}, error, warning, readOnly, disabled, children, className }: ${groupName}Props) {
  const messageId = useId();
  const hasMessage = Boolean(error || warning);
  return (
    <GroupContext.Provider value={{ readOnly, disabled }}>
      <fieldset
        className={[styles.group, className].filter(Boolean).join(' ')}
        data-orientation={orientation}
        data-invalid={error ? '' : undefined}
        data-warning={warning && !error ? '' : undefined}
        data-readonly={readOnly ? '' : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        disabled={disabled}
      >
        <legend className={styles.legend}>{legend}</legend>
        <div className={styles.items}>{children}</div>
        {error && (
          <span id={messageId} className={styles.groupErrorRow}>
            <span className={styles.groupErrorIcon} aria-hidden="true">${iconTag('groupError')}</span>
            <span className={styles.groupErrorText}>{error}</span>
          </span>
        )}
        {warning && !error && (
          <span id={messageId} className={styles.groupWarningRow}>
            <span className={styles.groupWarningIcon} aria-hidden="true">${iconTag('groupWarning')}</span>
            <span className={styles.groupWarningText}>{warning}</span>
          </span>
        )}
      </fieldset>
    </GroupContext.Provider>
  );
}
` : ''}`;

  // Figma copy
  const valueText = String(field.properties.find((p) => p.name === 'Value')?.default ?? sampleText(field, /_value$/) ?? 'Checkbox');
  const headingText = String(field.properties.find((p) => p.name === 'Label')?.default ?? 'Label');
  const errorText = sampleText(field, /^_error-row\/(?!Icon)/i) ?? '';
  const warningText = sampleText(field, /^_warning-row\/(?!Icon)/i) ?? '';
  const legendText = group ? sampleText(group, /^_group-label$/) ?? 'Group label' : '';
  const groupError = group ? sampleText(group, /^_g-error\/(?!Icon)/i) ?? '' : '';
  const groupWarning = group ? sampleText(group, /^_g-warning\/(?!Icon)/i) ?? '' : '';
  const types = axisOptions(control, 'Type');
  const states = axisOptions(control, 'State');
  const typeArgs = (t: string) => {
    const k = t.toLowerCase();
    const a: string[] = [];
    if (k.includes('indeterminate')) a.push('indeterminate: true');
    else if (!k.includes('unselected') && k.includes('selected')) a.push('defaultChecked: true');
    if (k.startsWith('error')) a.push('invalid: true');
    return `{ ${a.join(', ')} }`;
  };
  const stateArgs = (s: string) => {
    const k = s.toLowerCase();
    return /hover/.test(k) ? `{ 'data-force-state': 'hover' }` : /focus/.test(k) ? `{ 'data-force-state': 'focus' }` : /press/.test(k) ? `{ 'data-force-state': 'pressed' }` : /disabled/.test(k) ? '{ disabled: true }' : '{}';
  };
  const fieldStates = axisOptions(field, 'State');
  const fieldStateArgs = (s: string) => {
    const k = s.toLowerCase();
    return /focus/.test(k) ? `{ 'data-force-state': 'focus' }` : /invalid|error/.test(k) ? `{ error: ${q(errorText)} }` : /warning/.test(k) ? `{ warning: ${q(warningText)} }` : /read/.test(k) ? '{ readOnly: true, defaultChecked: true }' : /disabled/.test(k) ? '{ disabled: true }' : '{}';
  };

  const stories = `// Generated by ds-sync from Figma "${control.name}", "${field.name}"${group ? `, "${group.name}"` : ''}. Do not edit by hand.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';

import { Labelled, Matrix, Row, Stack } from '../../storybook/layout';
import { ${name}${group ? `, ${groupName}` : ''}, type ${name}Props } from './${name}';

const TYPE_ARGS: Record<string, Partial<${name}Props>> = { ${types.map((t) => `${q(t)}: ${typeArgs(t)}`).join(', ')} };
const STATE_ARGS: Record<string, Partial<${name}Props>> = { ${states.map((s) => `${q(s)}: ${stateArgs(s)}`).join(', ')} };
const FIELD_STATE_ARGS: Record<string, Partial<${name}Props>> = { ${fieldStates.map((s) => `${q(s)}: ${fieldStateArgs(s)}`).join(', ')} };

const meta = {
  title: 'Components/${name}',
  component: ${name},
  args: { size: ${q(defaultSize)}, label: ${q(valueText)}, heading: ${q(headingText)}, onChange: fn() },
  argTypes: {
    size: { control: 'inline-radio', options: [${sizes.map((s) => q(kebab(s))).join(', ')}], description: 'Figma: ${control.name} Size' },
    label: { control: 'text', description: 'Figma: ${field.name} Value' },
    heading: { control: 'text', description: 'Figma: ${field.name} Label' },
    description: { control: 'text', description: 'Figma: ${field.name} Has description' },
    helperText: { control: 'text', description: 'Figma: ${field.name} Has helper' },
    error: { control: 'text', description: 'Figma: State=Invalid' },
    warning: { control: 'text', description: 'Figma: State=Warning' },
    'data-force-state': { table: { disable: true } },
  },
  parameters: { figma: { fileKey: ${q(ctx.fileKey)}, nodeIds: [${[control, field, group].filter(Boolean).map((s) => q(s!.nodeId)).join(', ')}] } },
} satisfies Meta<typeof ${name}>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma default: ${field.name} Type=${axisDefault(field, 'Type')}, State=${axisDefault(field, 'State')}. Clicking toggles. */
export const Default: Story = {
  play: async ({ canvas, args }) => {
    const box = canvas.getByRole('checkbox', { name: ${q(valueText)} });
    await expect(box).not.toBeChecked();
    await userEvent.click(box);
    await expect(box).toBeChecked();
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};

/** Figma ${field.name} Type: Unselected, Selected, Indeterminate. */
export const SelectionTypes: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Stack>
      <${name} {...args} heading={undefined} label="Unselected" />
      <${name} {...args} heading={undefined} label="Selected" defaultChecked />
      <${name} {...args} heading={undefined} label="Indeterminate" indeterminate />
    </Stack>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: 'Selected' })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: 'Indeterminate' })).toBePartiallyChecked();
  },
};

/** Figma Style grid for ${control.name}: Type × State. Pseudo states are forced with data-force-state. */
export const ControlTypesAndStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Matrix
      label="${control.name} Type by State"
      columns={[${states.map((s) => q(s)).join(', ')}]}
      rows={[${types.map((t) => q(t)).join(', ')}]}
      cell={(row, column) => (
        <${name} size={args.size} aria-label={\`\${row} \${column}\`} {...TYPE_ARGS[row]} {...STATE_ARGS[column]} />
      )}
    />
  ),
};

/** Figma ${control.name} Size. */
export const Sizes: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Row>
${sizes.map((s) => `      <Labelled label=${q(s)}><${name} {...args} heading={undefined} size=${q(kebab(s))} defaultChecked /></Labelled>`).join('\n')}
    </Row>
  ),
};

/** Figma ${field.name} State, with the Figma message copy. */
export const FieldStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Stack>
${fieldStates.map((s) => `      <Labelled label=${q(s)}><${name} {...args} {...FIELD_STATE_ARGS[${q(s)}]} /></Labelled>`).join('\n')}
    </Stack>
  ),
};

/** Read-only checkboxes keep their value. */
export const ReadOnly: Story = {
  args: { readOnly: true, defaultChecked: true },
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox');
    await userEvent.click(box);
    await expect(box).toBeChecked();
  },
};

/** WAI-ARIA checkbox pattern: Tab focuses, Space toggles. */
export const Keyboard: Story = {
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox');
    await userEvent.tab();
    await expect(box).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(box).toBeChecked();
  },
};
${group ? `
/** Figma ${group.name}, Orientation=${axisDefault(group, 'Orientation')}. */
export const Group: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <${groupName} legend=${q(legendText)}>
      <${name} size={args.size} label=${q(valueText)} defaultChecked />
      <${name} size={args.size} label=${q(valueText)} />
      <${name} size={args.size} label=${q(valueText)} indeterminate />
    </${groupName}>
  ),
};

/** Figma ${group.name} Orientation. */
export const GroupOrientation: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Stack>
${axisOptions(group, 'Orientation').map((o) => `      <${groupName} legend=${q(o)} orientation=${q(kebab(o))}>\n        <${name} size={args.size} label=${q(valueText)} defaultChecked />\n        <${name} size={args.size} label=${q(valueText)} />\n      </${groupName}>`).join('\n')}
    </Stack>
  ),
};

/** Figma ${group.name} State, with the Figma message copy. */
export const GroupStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Stack>
      <${groupName} legend="Enabled"><${name} size={args.size} label=${q(valueText)} /></${groupName}>
      <${groupName} legend="Invalid" error=${q(groupError)}><${name} size={args.size} label=${q(valueText)} /></${groupName}>
      <${groupName} legend="Warning" warning=${q(groupWarning)}><${name} size={args.size} label=${q(valueText)} /></${groupName}>
      <${groupName} legend="Read-Only" readOnly><${name} size={args.size} label=${q(valueText)} defaultChecked /></${groupName}>
    </Stack>
  ),
};
` : ''}`;

  const mapping: ComponentReport['props'] = [
    { prop: 'size', figma: `${control.name} Size` },
    { prop: 'checked / defaultChecked', figma: `Type=Selected`, note: 'Native input attributes.' },
    { prop: 'indeterminate', figma: 'Type=Indeterminate' },
    { prop: 'error', figma: 'State=Invalid', note: 'Takes the message text.' },
    { prop: 'invalid', figma: 'Type=Error-*', note: 'Invalid styling without a message.' },
    { prop: 'warning', figma: 'State=Warning' },
    { prop: 'readOnly', figma: 'State=Read-Only' },
    { prop: 'disabled', figma: 'State=Disabled' },
    { prop: 'label', figma: `${field.name} Value` },
    { prop: 'heading', figma: `${field.name} Label (Has label)` },
    { prop: 'description', figma: `${field.name} Has description` },
    { prop: 'helperText', figma: `${field.name} Has helper` },
    ...(group ? [{ prop: `${groupName} legend`, figma: `${group.name} group label` }, { prop: `${groupName} orientation`, figma: `${group.name} Orientation` }] : []),
  ];
  const description = control.description || field.description || '';
  const files = [
    { path: `${dir}/${name}.tsx`, content: tsx },
    { path: `${dir}/${name}.module.css`, content: css },
    { path: `${dir}/${name}.stories.tsx`, content: stories },
    {
      path: `${dir}/${name}.mdx`,
      content: mdxPage(name, name, [
        { heading: 'Selection types', story: 'SelectionTypes' },
        { heading: 'Control types and states', story: 'ControlTypesAndStates' },
        { heading: 'Sizes', story: 'Sizes' },
        { heading: 'Field states', story: 'FieldStates' },
        ...(group ? [{ heading: 'Group', story: 'Group' }, { heading: 'Group states', story: 'GroupStates' }] : []),
      ]),
    },
    { path: `${dir}/${name}.figma.json`, content: docsJson(ctx, [control, field, ...(group ? [group] : [])], name, description, mapping) },
  ];
  const dependencies = Object.assign({}, ...parts.map((p, i) => Object.fromEntries(Object.entries(p.dependencies).map(([k, v]) => [`${['control', 'field', 'group'][i]}.${k}`, v]))));
  return {
    files,
    report: {
      name,
      figmaSets: [control, field, group].filter(Boolean).map((s) => `${s!.name} (${s!.nodeId})`),
      files: files.map((f) => f.path),
      props: mapping,
      assumptions: [
        'Keyboard behaviour (Tab focuses, Space toggles) comes from the native checkbox and the WAI-ARIA checkbox pattern.',
        'Figma Type=Error-* (no message) became an `invalid` prop; State=Invalid (with message) became `error`.',
        `${groupName} passes readOnly and disabled to its checkboxes through React context.`,
      ],
      gaps: [],
      dependencies,
    },
  };
}
