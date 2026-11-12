/** Scenario 2: Figma design system -> a fresh, tested Storybook project. */
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { LoadedConfig } from '../config.ts';
import type { FigmaReader, FigmaRenderer } from '../figma/client.ts';
import type { FigmaIR, IRComponentSet } from '../ir/types.ts';
import { expandHome, readJson, writeText } from '../util/core.ts';
import { exportIcons, iconRefs, type IconAsset } from './icons.ts';
import { projectFiles } from './project.ts';
import { accordionTemplate } from './templates/accordion.ts';
import { actionTemplate } from './templates/action.ts';
import { checkboxTemplate } from './templates/checkbox.ts';
import { genericTemplate, instanceRef, type RegistryEntry } from './templates/generic.ts';
import type { Overrides } from '../discover/discover.ts';
import type { ComponentReport, GeneratedFile, TemplateContext, TemplateResult } from './templates/common.ts';
import { exportFromRest, loadTokens, TokenResolver, tokensCss, tokensDtcg, tokensTs } from './tokens.ts';
import { tagFor, wcAccordion, wcAction, wcCheckbox, wcGeneric, type WcResult } from './wc/components.ts';
import { wcProjectFiles } from './wc/project.ts';
import type { AccordionCore } from './templates/accordion.ts';
import type { ActionCore } from './templates/action.ts';
import type { CheckboxCore } from './templates/checkbox.ts';
import type { GenericCore } from './templates/generic.ts';

export type Target = 'react' | 'web-components';

export interface TargetConfig {
  target: Target;
  /** Output folder, relative to the config file. */
  outDir: string;
  packageName?: string;
}

export interface GenerateConfig {
  /** Output directory for the default target, relative to the config file. */
  outDir: string;
  /** Default output target (react: React + TypeScript + CSS Modules; web-components: Lit, works in any framework). */
  target?: Target;
  /** Several outputs from one run, e.g. React for the web app and Web Components for everything else. */
  targets?: TargetConfig[];
  /** Custom element tag prefix (web-components target), e.g. "ds" -> <ds-button>. */
  tagPrefix?: string;
  /** Package name of the generated project. */
  packageName?: string;
  /**
   * Figma variables export file (from the ds-sync Figma plugin). Optional: without it the
   * Variables REST API is used (Enterprise plans); without either, values stay raw.
   */
  variablesExport?: string;
  /** Variable collection -> HTML attribute that selects its non-default modes. */
  modeAttributes?: Record<string, string>;
  /**
   * Components to generate. Omit (or set mode "auto") to discover every component set in the file.
   * Each entry maps template roles to engine target ids.
   */
  components?: PlannedComponent[];
  mode?: 'auto' | 'config';
  /** Corrections to discovery (exclude sets, rename, force a template, reclassify frames). */
  overrides?: Overrides;
}

export interface PlannedComponent {
  name: string;
  template: 'action' | 'checkbox' | 'accordion' | 'switch' | 'generic';
  sets: Record<string, string>;
  /** Storybook title; default Components/<name>. */
  title?: string;
}

const SPECIALISED: Record<'action' | 'checkbox' | 'accordion', (ctx: TemplateContext, name: string) => TemplateResult> = {
  action: actionTemplate,
  checkbox: checkboxTemplate,
  accordion: accordionTemplate,
};

/** Generated folders are replaced; files are only written under them, so the target stays clean between runs. */
const OWNED = ['src', '.storybook', 'types'];

export async function generateStorybook(config: LoadedConfig, gen: GenerateConfig, ir: FigmaIR, renderer: FigmaRenderer, log: (m: string) => void, plan: PlannedComponent[] = gen.components ?? []) {
  let source: { variables?: Record<string, unknown[]> } = { variables: {} };
  if (gen.variablesExport) {
    source = readJson(resolve(config.baseDir, expandHome(gen.variablesExport)));
    log(`Variables: ${gen.variablesExport}`);
  } else {
    try {
      source = exportFromRest(await (renderer as unknown as FigmaReader).localVariables(ir.fileKey));
      log('Variables: read from the Figma Variables API');
    } catch {
      log('Variables: not available (the Variables API needs an Enterprise plan). Export them with the ds-sync Figma plugin and set generate.variablesExport; values stay raw until then.');
    }
  }
  const tokens = loadTokens(source);
  const resolver = new TokenResolver(tokens);
  // Mode attributes: light/dark collections drive data-theme; others data-<collection>. Config can override.
  const autoModes = Object.fromEntries(Object.entries(tokens.modes).map(([c, modes]) => [c, modes.some((m) => /dark/i.test(m)) ? 'data-theme' : `data-${c.replace(/^(primitives|semantic)\./, '').replace(/\W+/g, '-')}`]));
  const modeAttributes = { ...autoModes, ...(gen.modeAttributes ?? {}) };

  const setsById = new Map(ir.components.map((c) => [c.targetId, c]));
  const usedTargets = plan.flatMap((c) => Object.values(c.sets));
  const missing = usedTargets.filter((t) => !setsById.has(t));
  if (missing.length) throw new Error(`Component sets missing from the IR: ${missing.join(', ')}. Run "extract" first.`);

  const icons: IconAsset[] = await exportIcons(renderer, ir, iconRefs(ir, usedTargets));
  log(`Icons: ${icons.length} exported as SVG`);
  const iconMap = new Map(icons.map((i) => [i.figmaName, i]));

  // Nested instances: a variant node id of a generated set -> the component that renders it.
  const registry = new Map<string, RegistryEntry>();
  for (const c of plan) {
    if (c.template !== 'generic' && c.template !== 'action' && c.template !== 'switch') continue;
    const set = setsById.get(c.sets.main ?? '');
    if (!set) continue;
    const entry: RegistryEntry = { component: c.name, importPath: `../${c.name}/${c.name}`, kind: c.template, set };
    for (const v of set.variants) registry.set(v.nodeId, entry);
  }

  const files: GeneratedFile[] = [];
  const reports: ComponentReport[] = [];
  const results: { c: PlannedComponent; ctx: TemplateContext; result: TemplateResult }[] = [];
  for (const c of plan) {
    const sets: Record<string, IRComponentSet> = Object.fromEntries(Object.entries(c.sets).map(([role, id]) => [role, setsById.get(id)!]));
    const ctx: TemplateContext = { fileKey: ir.fileKey, version: ir.version, sets, resolver, icons: iconMap };
    const result = c.template === 'generic' || c.template === 'switch'
      ? genericTemplate(ctx, c.name, {
          title: c.title ?? `Components/${c.name}`,
          ...(c.template === 'switch' ? { behavior: 'switch' as const } : {}),
          instance: (part) => {
            const entry = part.instanceComponentId ? registry.get(part.instanceComponentId) : undefined;
            return entry ? instanceRef(entry, part, iconMap) : undefined;
          },
        })
      : SPECIALISED[c.template](ctx, c.name);
    const issue = gen.overrides?.knownIssues?.[c.name];
    if (issue) {
      // Accepted design issue: axe still runs and reports, but does not fail the story tests.
      for (const f of result.files) {
        if (f.path.endsWith('.stories.tsx')) f.content = f.content.replace('parameters: {', `parameters: {\n    // Known design issue (ds-sync.config.json overrides.knownIssues): ${issue.replace(/\*\//g, '')}\n    a11y: { test: 'todo' },`);
      }
      result.report.gaps.push(`Known design issue (accessibility checks set to todo): ${issue}`);
    }
    files.push(...result.files);
    reports.push(result.report);
    results.push({ c, ctx, result });
    log(`${c.name}: template ${c.template}`);
  }

  const colorTokens = tokens.rows
    .filter((r) => r.collection === 'semantic.color')
    .map((r) => ({ name: r.name, cssVar: r.cssVar }));
  const page = {
    background: tokens.rows.find((r) => r.collection === 'semantic.color' && /^surface\/bg\/default$/.test(r.name))?.cssVar,
    text: tokens.rows.find((r) => r.collection === 'semantic.color' && /^text\/(primary|default)$/.test(r.name))?.cssVar,
  };
  // Platform-neutral tokens, the same for every target.
  const tokenFiles: GeneratedFile[] = [
    { path: 'src/tokens/tokens.css', content: tokensCss(tokens, modeAttributes) },
    { path: 'src/tokens/tokens.json', content: tokensDtcg(tokens) },
    { path: 'src/tokens/tokens.ts', content: tokensTs(tokens) },
  ];

  const decisions = resolver.decisions;
  const tokenMap = {
    note: 'How each Figma value became CSS. "bound": bound to a variable in Figma and matched to a token by value (the Variables REST API is Enterprise-only, so variable ids cannot be read directly). "raw-in-figma": not bound in Figma, kept as a raw value. "no-matching-token": bound in Figma, but no token has that value.',
    counts: {
      bound: decisions.filter((d) => d.reason === 'bound').length,
      rawInFigma: decisions.filter((d) => d.reason === 'raw-in-figma').length,
      noMatchingToken: decisions.filter((d) => d.reason === 'no-matching-token').length,
    },
    decisions,
  };
  const shared: GeneratedFile[] = [
    ...tokenFiles,
    { path: 'token-map.json', content: JSON.stringify(tokenMap, null, 2) + '\n' },
    { path: 'GENERATION-REPORT.md', content: report(ir, reports, tokenMap.counts, icons) },
  ];

  const targets: TargetConfig[] = gen.targets?.length ? gen.targets : [{ target: gen.target ?? 'react', outDir: gen.outDir, ...(gen.packageName ? { packageName: gen.packageName } : {}) }];
  const written: { target: Target; outDir: string; files: string[] }[] = [];
  for (const t of targets) {
    const outFiles: GeneratedFile[] = [...shared];
    const packageName = t.packageName ?? gen.packageName ?? 'figma-storybook';
    if (t.target === 'react') {
      outFiles.push(
        ...files,
        ...projectFiles({ name: packageName, figma: { fileKey: ir.fileKey, fileName: ir.fileName, version: ir.version }, modes: tokens.modes, modeAttributes, components: plan.map((c) => c.name), icons, colorTokens, page }),
        { path: 'README.md', content: readme(ir, plan, 'react') },
      );
    } else {
      const prefix = gen.tagPrefix ?? 'ds';
      const o = { prefix, packageName };
      const tagOf = (component: string) => tagFor(prefix, component);
      const wc: { name: string; r: WcResult }[] = [];
      for (const { c, ctx, result } of results) {
        let r: WcResult;
        if (c.template === 'generic' || c.template === 'switch') {
          r = wcGeneric(ctx, c.name, result.core as GenericCore, o, (part) => {
            const entry = part.instanceComponentId ? registry.get(part.instanceComponentId) : undefined;
            return entry ? instanceRef(entry, part, iconMap) : undefined;
          }, tagOf);
        } else if (c.template === 'action') r = wcAction(ctx, c.name, result.core as ActionCore, o);
        else if (c.template === 'checkbox') r = wcCheckbox(ctx, c.name, result.core as CheckboxCore, o);
        else r = wcAccordion(ctx, c.name, result.core as AccordionCore, o);
        const issue = gen.overrides?.knownIssues?.[c.name];
        if (issue) {
          for (const f of r.files) {
            if (f.path.endsWith('.stories.ts')) f.content = f.content.replace('parameters: {', `parameters: {\n    // Known design issue (ds-sync.config.json overrides.knownIssues): ${issue.replace(/\*\//g, '')}\n    a11y: { test: 'todo' },`);
          }
        }
        wc.push({ name: c.name, r });
        outFiles.push(...r.files);
      }
      outFiles.push(
        ...wcProjectFiles({
          name: packageName,
          figma: { fileKey: ir.fileKey, fileName: ir.fileName },
          modes: tokens.modes,
          modeAttributes,
          components: wc.map((x) => ({ name: x.name, tags: x.r.tags, module: x.r.module })),
          icons,
          colorTokens,
          page,
          typings: wc.flatMap((x) => x.r.typings),
        }),
        { path: 'README.md', content: readme(ir, plan, 'web-components', prefix) },
      );
    }
    const outDir = resolve(config.baseDir, t.outDir);
    // Replace generated folders, keep anything else (node_modules, user files) in place.
    for (const dir of OWNED) {
      const abs = join(outDir, dir);
      if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
    }
    for (const f of outFiles) writeText(join(outDir, f.path), f.content);
    written.push({ target: t.target, outDir, files: outFiles.map((f) => f.path) });
    log(`${t.target}: ${outFiles.length} files → ${outDir}`);
  }
  return { outDir: written[0]!.outDir, targets: written, files: written.flatMap((w) => w.files), reports, tokenCounts: tokenMap.counts };
}

function report(ir: FigmaIR, reports: ComponentReport[], counts: Record<string, number>, icons: IconAsset[]): string {
  const lines = [
    '# Generation report',
    '',
    `Generated by ds-sync from Figma "${ir.fileName}" (\`${ir.fileKey}\`), version ${ir.version}.`,
    '',
    '## Tokens',
    '',
    `- Bound in Figma and mapped to a token: ${counts.bound}`,
    `- Raw in Figma (kept raw): ${counts.rawInFigma}`,
    `- Bound in Figma but no token with that value: ${counts.noMatchingToken}`,
    '',
    'Details are in `token-map.json`.',
    '',
    `## Icons`,
    '',
    ...icons.map((i) => `- \`${i.name}\` from ${i.figmaName} (${i.nodeId})`),
    '',
  ];
  for (const r of reports) {
    lines.push(`## ${r.name}`, '', `Figma: ${r.figmaSets.join(', ')}`, '', '| Figma | Prop | Note |', '| --- | --- | --- |');
    for (const p of r.props) lines.push(`| ${p.figma} | \`${p.prop}\` | ${p.note ?? ''} |`);
    lines.push('', '**Not from Figma (archetype defaults or decisions):**', '', ...r.assumptions.map((a) => `- ${a}`), '');
    if (r.gaps.length) lines.push('**Gaps:**', '', ...r.gaps.map((g) => `- ${g}`), '');
    lines.push('<details><summary>Which Figma axes each style depends on</summary>', '', ...Object.entries(r.dependencies).map(([k, v]) => `- \`${k}\`: ${v.length ? v.join(', ') : 'none (same in every variant)'}`), '', '</details>', '');
  }
  return lines.join('\n');
}

function readme(ir: FigmaIR, plan: PlannedComponent[], target: Target, prefix = 'ds'): string {
  const list = plan.map((c) => `${c.name}${c.template === 'generic' ? '' : ` (${c.template})`}`).join(', ');
  const common = `Generated by the ds-sync engine from the Figma file "${ir.fileName}" (\`${ir.fileKey}\`), version ${ir.version}.
Components (${plan.length}): ${list}.
Components marked with an archetype have behaviour from WAI-ARIA patterns; the others are generated by the generic template (visuals only).`;
  const files = `- \`src/tokens/\`: every Figma variable as CSS custom properties (\`tokens.css\`, modes as \`data-*\` attributes), W3C DTCG JSON (\`tokens.json\`, for any platform or tool) and typed TypeScript (\`tokens.ts\`).
- \`GENERATION-REPORT.md\`: what came from Figma, what came from archetype defaults, and the gaps.
- \`token-map.json\`: how each Figma value was mapped to a token.

Everything under \`src/\` and \`.storybook/\` is regenerated. To change it, change Figma or the generator, not these files.`;
  if (target === 'react') {
    return `# Storybook generated from Figma (React)

${common}

\`\`\`bash
npm install
npm run storybook    # http://localhost:6006
npm test             # every story: render, interactions, accessibility (axe)
npm run typecheck
\`\`\`

- \`src/components/*\`: React components, CSS modules, stories, MDX docs and the Figma docs text (\`*.figma.json\`).
${files}
`;
  }
  return `# Web Components generated from Figma

${common}

Standard custom elements built with [Lit](https://lit.dev): they work in React, Vue, Angular, Svelte or plain HTML. Each component's docs page shows how to use it in each framework.

\`\`\`bash
npm install
npm run storybook    # http://localhost:6007
npm test             # every story: render, interactions, accessibility (axe, inside Shadow DOM)
npm run typecheck
\`\`\`

\`\`\`html
<script type="module">import 'your-package';</script>
<link rel="stylesheet" href="your-package/tokens.css" />
<${prefix}-button variant="primary">Save</${prefix}-button>
\`\`\`

- \`src/components/*\`: custom elements (\`<${prefix}-…>\`), their CSS (the same CSS as the React output), stories and MDX docs.
- \`types/react.d.ts\`: JSX typings for React 19 apps.
${files}
`;
}
