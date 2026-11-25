// Component Doc Spec v1: built for every generated component from the Figma IR, the generator's report and the
// matching reference spec, then checked against the stories file and docs page actually written (React target).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import type { IRComponentSet } from '../ir/types.ts';
import type { ComponentReport } from '../generate/templates/common.ts';
import { propPlan } from '../generate/templates/generic.ts';
import type { Coverage, DocSpec, DocSpecProperty, DocSpecSection, DocSpecStory, Reference, Source } from './types.ts';

/** Bundled with the engine: src/docspec/ and dist/ both reach references/ from here. */
export function referencesDir(): string {
  for (const rel of ['../references', '../../references']) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(join(dir, 'component.yaml'))) return dir;
  }
  throw new Error('references/ folder not found next to the engine');
}

/** Order matters for name matching: specific kinds first, broad display kinds (badge, typography) last. */
const NAME_ORDER = ['dialog', 'tooltip', 'notification', 'table', 'tabs', 'accordion', 'menu', 'select', 'text-input', 'checkbox', 'radio', 'switch', 'link', 'button', 'navigation', 'progress', 'avatar', 'card', 'list', 'divider', 'icon', 'badge', 'typography'];

export function loadReferences(dir = referencesDir()): Reference[] {
  return readdirSync(dir).filter((f) => f.endsWith('.yaml')).map((f) => parseYaml(readFileSync(join(dir, f), 'utf8')) as Reference);
}

/** Behaviour the generator recognised -> reference kind. */
const BY_BEHAVIOUR: Record<string, string> = {
  action: 'button', button: 'button', link: 'link', checkbox: 'checkbox', 'checkbox-single': 'checkbox', switch: 'switch',
  radio: 'radio', 'radio-single': 'radio', 'radio-field': 'radio', 'radio-group': 'radio', 'collection:radiogroup': 'radio',
  combobox: 'select', 'collection:listbox': 'select', 'menu-button': 'menu', 'collection:menu': 'menu', 'collection:tablist': 'tabs',
  accordion: 'accordion', disclosure: 'accordion', dialog: 'dialog', input: 'text-input',
};

export function pickReference(refs: Reference[], behaviour: string | undefined, names: string[]): { ref: Reference; from: DocSpec['kind']['from'] } {
  const byId = new Map(refs.map((r) => [r.id, r]));
  const b = behaviour ? BY_BEHAVIOUR[behaviour] : undefined;
  if (b && byId.has(b)) return { ref: byId.get(b)!, from: 'behaviour' };
  const text = names.join(' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  for (const id of NAME_ORDER) {
    const r = byId.get(id);
    if (r?.matches.names.some((n) => new RegExp(n, 'i').test(text))) return { ref: r, from: 'name' };
  }
  return { ref: byId.get('component')!, from: 'fallback' };
}

/** Docs page headings that satisfy each reference section. */
const SECTION_HEADINGS: Record<string, RegExp> = {
  overview: /^overview$/i, preview: /^preview$/i, variants: /^variants$/i, states: /^states?$/i, accessibility: /^accessibility$/i,
  usage: /^(usage|when to use|guidelines|best practices)/i, api: /^(properties|props|api)$/i, anatomy: /^(anatomy|composition)$/i,
  related: /^related/i, code: /^code$/i, sizes: /^sizes?$/i, icons: /^(icons?|with icons?)$/i,
};

interface StoryBlock { export: string; name: string; tags: string; body: string }

function storyBlocks(stories: string): { meta: string; blocks: StoryBlock[] } {
  const first = stories.search(/^(?:\/\*\*[^\n]*\*\/\n)?export const \w+: Story/m);
  const meta = first < 0 ? stories : stories.slice(0, first);
  const blocks = [...stories.matchAll(/^(?:\/\*\*[^\n]*\*\/\n)?export const (\w+): Story = (?:\{\};|\{[\s\S]*?\n\};)/gm)].map((m) => ({
    export: m[1]!,
    name: /^\s+name: "?'?([^"'\n]+)/m.exec(m[0])?.[1] ?? m[1]!,
    tags: /^\s+tags: \[([^\]]*)\]/m.exec(m[0])?.[1] ?? '',
    body: m[0],
  }));
  return { meta, blocks };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface DocSpecInput {
  name: string;
  title: string;
  behaviour?: string;
  buildingBlock: boolean;
  sets: IRComponentSet[];
  fileKey: string;
  version: string;
  report: ComponentReport;
  /** Generated files of the component (React target, after the documentation pass). */
  stories?: string;
  mdx?: string;
  decidedDescription?: string;
  descriptions?: Record<string, string>;
  refs: Reference[];
  /** Code mode: Figma values shown by interacting with the real component (hover, focus, press), and the variants
   * that need such a state. */
  interactive?: { values: Record<string, string[]>; variants: string[] };
}

export function buildDocSpec(x: DocSpecInput): DocSpec {
  const main = x.sets[0]!;
  const { ref, from } = pickReference(x.refs, x.behaviour, [main.name, x.name]);
  const { meta, blocks } = storyBlocks(x.stories ?? '');
  const metaHidden = /^const meta = \{\n\s+tags: \[[^\]]*'!dev'/m.test(meta);
  const visibility = (b: StoryBlock): DocSpecStory['visibility'] => (/!autodocs/.test(b.tags) ? 'test' : /!dev/.test(b.tags) || metaHidden ? 'docs' : 'dev');
  const visible = blocks.filter((b) => visibility(b) !== 'test');
  const testOnly = blocks.filter((b) => visibility(b) === 'test');
  const argLine = (figma: string, set: string) => new RegExp(`^\\s+'?([\\w-]+)'?: \\{[^\\n]*Figma: (?:[^'\\n]*?, )?(?:${esc(set)} )?${esc(figma)}(?:[ =('.,]|$)`, 'm');
  const gaps: DocSpec['gaps'] = [];

  const properties: DocSpecProperty[] = [];
  const hasDefault = visible.some((b) => b.export === 'Default');
  for (const s of x.sets) {
  // A boolean that shows one swappable slot became that slot's prop (pass content to show it, null to hide it).
  const toggles = new Map(propPlan(s).toggles.map((t) => [t.bool, t.slotProp]));
  for (const p of s.properties) {
    const own = (f: string) => (f.startsWith(`${s.name} `) ? f.slice(s.name.length + 1) : f);
    const reported = x.report.props.filter((r) => own(r.figma) === p.name || own(r.figma).startsWith(`${p.name}=`) || own(r.figma).startsWith(`${p.name} (`) || r.toggle?.prop === p.name);
    const arg = argLine(p.name, s.name).exec(meta);
    const props = [...new Set([...reported.map((r) => r.prop), ...(arg ? [arg[1]!] : []), ...(toggles.has(p.name) ? [toggles.get(p.name)!] : [])])];
    const control = arg ? (/control: false/.test(arg[0]) ? 'none' : /control: '([\w-]+)'/.exec(arg[0])?.[1] ?? 'custom') : props.length ? 'hidden' : 'none';
    const isState = p.type === 'VARIANT' && (p.options ?? []).some((o) => /^(hover|hovered|focus|focused|active|pressed|disabled|error|invalid|warning|read[ -]?only|skeleton|loading|selected)$/i.test(o));
    const role: DocSpecProperty['role'] = p.type === 'TEXT' ? 'content' : p.type === 'INSTANCE_SWAP' ? 'slot' : p.type === 'BOOLEAN' ? 'option' : isState ? 'state' : 'appearance';
    const mentioned = (p.type === 'TEXT' && hasDefault && props.length > 0) || (toggles.has(p.name) && visible.some((b) => b.export === 'Options')) || visible.some((b) => new RegExp(`Figma:? [^\\n]*\\b${esc(p.name)}\\b|\\b${props.map(esc).join('|') || '\\b$^'}\\b`).test(b.body));
    let values: DocSpecProperty['values'];
    if (p.type === 'VARIANT') {
      values = (p.options ?? []).map((o) => {
        const label = new RegExp(`'${esc(o)}':|label=["']${esc(o)}["']|${esc(p.name)}: ${esc(o)}\\b`);
        // The default value is what the Default story renders.
        const shown = (hasDefault && o === String(p.default)) || visible.some((b) => label.test(b.body));
        const inTest = testOnly.some((b) => b.body.includes(`${p.name}=${o}`));
        const optionsLine = arg?.[0] ?? '';
        const kebab = o.trim().replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
        const asControl = optionsLine.includes(`'${kebab}'`) || (/control: 'boolean'/.test(optionsLine) && /^(true|false)$/i.test(o));
        const coverage: Coverage = shown ? 'shown' : asControl ? 'control' : inTest ? 'test' : x.interactive?.values[p.name]?.includes(o) ? 'interactive' : 'missing';
        return { figma: o, coverage };
      });
    }
    const valueMissing = values?.some((v) => v.coverage === 'missing');
    const coverage: Coverage = mentioned ? 'shown' : arg || props.length ? 'control' : 'missing';
    const desc = props.map((pr) => x.descriptions?.[pr]).find(Boolean);
    properties.push({
      figma: p.name, type: p.type, props, role, default: p.default as string | boolean, control, coverage,
      ...(values ? { values } : {}),
      ...(desc ? { description: { text: desc, source: 'decision' as Source } } : {}),
    });
    if (coverage === 'missing') gaps.push({ item: p.name, message: `Figma property "${p.name}" (${p.type.toLowerCase()}) has no prop, control or story.` });
    if (valueMissing) for (const v of values!.filter((v) => v.coverage === 'missing')) gaps.push({ item: `${p.name}=${v.figma}`, message: `Value "${v.figma}" of "${p.name}" is not shown in any story and cannot be picked in a control.` });
  }
  }

  // Every designed variant renders in the variants story (the visual check compares it with Figma's own render).
  const variantIds = x.sets.flatMap((s) => s.variants.map((v) => v.nodeId));
  const renderedIds = variantIds.filter((id) => (x.stories ?? '').includes(`'${id}'`) || (x.stories ?? '').includes(`"${id}"`));
  const rendered = renderedIds.length;
  const interactiveVariants = variantIds.filter((id) => !renderedIds.includes(id) && x.interactive?.variants.includes(id)).length;
  if (rendered + interactiveVariants < variantIds.length) gaps.push({ item: 'variants', message: `${variantIds.length - rendered - interactiveVariants} of ${variantIds.length} designed Figma variants are not rendered in any story.` });

  // Docs page sections required by the reference.
  const headings = [...(x.mdx ?? '').matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]!.trim());
  const sections: DocSpecSection[] = ref.sections.map((s) => {
    const re = SECTION_HEADINGS[s.id] ?? new RegExp(`^${esc(s.id)}`, 'i');
    const heading = headings.find((h) => re.test(h));
    return { id: s.id, required: s.required, status: heading ? 'present' : 'missing', ...(heading ? { heading } : {}) };
  });
  for (const s of sections.filter((s) => s.required && s.status === 'missing')) gaps.push({ item: `section:${s.id}`, message: `The docs page has no "${s.id}" section (required for ${ref.title.toLowerCase()} components).` });

  const description = main.description?.trim() ? { text: main.description.trim(), source: 'figma' as Source } : x.decidedDescription ? { text: x.decidedDescription, source: 'decision' as Source } : undefined;
  if (!description) gaps.push({ item: 'description', message: 'No description in Figma or in decisions: the overview has no prose.' });

  const allValues = properties.flatMap((p) => p.values ?? []);
  const propsCovered = properties.filter((p) => p.coverage !== 'missing').length;
  const valuesMissing = allValues.filter((v) => v.coverage === 'missing').length;
  return {
    specVersion: '1.0',
    component: x.name,
    title: x.title,
    kind: { id: ref.id, title: ref.title, from },
    ...(x.behaviour && x.behaviour !== 'generic' ? { behaviour: x.behaviour } : {}),
    buildingBlock: x.buildingBlock,
    figma: {
      fileKey: x.fileKey, version: x.version,
      sets: x.sets.map((s) => ({ id: s.nodeId, name: s.name, page: s.page, variants: s.variants.length })),
      docFrames: x.sets.flatMap((s) => s.docFrames.map((d) => ({ id: d.nodeId, name: d.name }))),
    },
    ...(description ? { description } : {}),
    properties,
    stories: blocks.map((b) => ({ export: b.export, name: b.name, visibility: visibility(b), shows: properties.filter((p) => p.props.some((pr) => new RegExp(`\\b${esc(pr)}\\b`).test(b.body)) || b.body.includes(`Figma ${p.figma}`)).map((p) => p.figma) })),
    sections,
    accessibility: { ...ref.accessibility, source: 'reference' },
    related: ref.related ?? [],
    coverage: {
      properties: { total: properties.length, covered: propsCovered },
      values: { total: allValues.length, shown: allValues.filter((v) => v.coverage === 'shown').length, control: allValues.filter((v) => v.coverage === 'control' || v.coverage === 'test' || v.coverage === 'interactive').length, missing: valuesMissing },
      variants: { total: variantIds.length, rendered, ...(x.interactive ? { interactive: interactiveVariants } : {}) },
      sections: { required: sections.filter((s) => s.required).length, present: sections.filter((s) => s.required && s.status === 'present').length },
      complete: propsCovered === properties.length && valuesMissing === 0 && rendered + interactiveVariants === variantIds.length,
    },
    gaps,
  };
}

/** DOCS-COVERAGE.md: one line per component, then the gaps. */
export function coverageReport(specs: DocSpec[]): string {
  const sum = (f: (s: DocSpec) => number) => specs.reduce((n, s) => n + f(s), 0);
  const complete = specs.filter((s) => s.coverage.complete).length;
  const lines = [
    '# Documentation coverage',
    '',
    'Every component the Figma file defines, checked against its generated stories and docs page (Component Doc Spec v1, one JSON per component in `docspec/`).',
    '',
    `- Components: ${specs.length}; every Figma item in Storybook: ${complete}/${specs.length}`,
    `- Figma properties in Storybook: ${sum((s) => s.coverage.properties.covered)}/${sum((s) => s.coverage.properties.total)}`,
    `- Property values: ${sum((s) => s.coverage.values.shown)} shown in a story, ${sum((s) => s.coverage.values.control)} reachable through a control or by interaction, ${sum((s) => s.coverage.values.missing)} missing`,
    `- Designed variants rendered: ${sum((s) => s.coverage.variants.rendered)}/${sum((s) => s.coverage.variants.total)}${specs.some((s) => s.coverage.variants.interactive !== undefined) ? ` (plus ${sum((s) => s.coverage.variants.interactive ?? 0)} in a hover, focus or pressed state, shown by interacting with the real component)` : ''}`,
    `- Required docs sections present: ${sum((s) => s.coverage.sections.present)}/${sum((s) => s.coverage.sections.required)}`,
    '',
    '| Component | Kind | Properties | Values (shown / control / missing) | Variants | Sections | Complete |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...specs.map((s) => `| ${s.component} | ${s.kind.title}${s.kind.from === 'fallback' ? ' (generic)' : ''} | ${s.coverage.properties.covered}/${s.coverage.properties.total} | ${s.coverage.values.shown} / ${s.coverage.values.control} / ${s.coverage.values.missing} | ${s.coverage.variants.rendered}${s.coverage.variants.interactive ? `+${s.coverage.variants.interactive}` : ''}/${s.coverage.variants.total} | ${s.coverage.sections.present}/${s.coverage.sections.required} | ${s.coverage.complete ? 'yes' : 'no'} |`),
    '',
    '## Gaps',
    '',
  ];
  for (const s of specs.filter((s) => s.gaps.length)) {
    lines.push(`### ${s.component}`, '', ...s.gaps.map((g) => `- ${g.message}`), '');
  }
  return lines.join('\n') + '\n';
}
