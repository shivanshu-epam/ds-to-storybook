/** Scenario 2: Figma design system -> a fresh, tested Storybook project. */
import { composition, docsPage, isBuildingBlock, polishStories, templateSections } from './docs.ts';
import { activeDecisions, decidedSetDescription, decisionsReport, DECISIONS_FILE, loadDecisions, setActiveDecisions, validateDecisions, type ApplyLevel, type DecisionsFile } from '../decisions/decisions.ts';
import { buildScorecard, scorecardLines, scorecardReport } from './scorecard.ts';
import { leadSentence } from './templates/common.ts';
import { fontsReport, httpFontSource, planFonts, usedFonts, type FontOverride, type FontPlan } from './fonts.ts';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { LoadedConfig } from '../config.ts';
import type { FigmaReader, FigmaRenderer } from '../figma/client.ts';
import type { FigmaIR, IRComponentSet } from '../ir/types.ts';
import { expandHome, readJson, writeText } from '../util/core.ts';
import { exportIcons, exportShapes, iconRefs, type IconAsset } from './icons.ts';
import { projectFiles } from './project.ts';
import { accordionTemplate } from './templates/accordion.ts';
import { actionTemplate } from './templates/action.ts';
import { checkboxTemplate } from './templates/checkbox.ts';
import { genericTemplate, instanceRef, propPlan, setBreakpoints, type RegistryEntry } from './templates/generic.ts';
import type { Overrides } from '../discover/discover.ts';
import type { ComponentReport, GeneratedFile, TemplateContext, TemplateResult } from './templates/common.ts';
import { exportFromRest, loadTokens, setFontStacks, TokenResolver, tokensCss, tokensDtcg, tokensTs } from './tokens.ts';
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
  /** Sidebar categories (STANDARD.md section 2): category -> component names. Unassigned components stay under Components. */
  categories?: Record<string, string[]>;
  /** Components Figma marks as building blocks ("_", "." or "Base") that are public anyway, and components to treat as internal. */
  publicComponents?: string[];
  internalComponents?: string[];
  /**
   * Fonts: by default each Figma family is loaded from its open-source npm package (Fontsource) when one exists.
   * Map a family to your own package ({ package, family?, imports? }) or to false; false for the whole setting skips the lookup.
   */
  fonts?: Record<string, FontOverride> | false;
  /**
   * Interpretation decisions (code names and descriptions for Figma properties), see docs/HYBRID.md.
   * file defaults to ds-sync.decisions.json next to the config; apply defaults to "accepted".
   */
  decisions?: { file?: string; apply?: ApplyLevel };
  /**
   * Viewport values of Figma "Screen Size" / "Device" / "Breakpoint" axes -> CSS media conditions, e.g.
   * { "Mobile": "(max-width: 767px)" }. Such an axis then follows the viewport when its prop is not set.
   * Figma does not say at which width a layout changes, so nothing is assumed without this.
   */
  breakpoints?: Record<string, string>;
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
  template: 'action' | 'checkbox' | 'checkbox-single' | 'disclosure' | 'button' | 'link' | 'accordion' | 'switch' | 'radio' | 'radio-field' | 'radio-group' | 'input' | 'dialog' | 'generic';
  sets: Record<string, string>;
  /** Storybook title; default Components/<name>. */
  title?: string;
}

const SPECIALISED: Record<'action' | 'checkbox' | 'accordion', (ctx: TemplateContext, name: string) => TemplateResult> = {
  action: actionTemplate,
  checkbox: checkboxTemplate,
  accordion: accordionTemplate,
};

/** "theme=dark project=b" -> { theme: 'dark', project: 'b' }; "default" -> {} (the default modes). */
export function parseModeKey(key: string): Record<string, string> {
  if (/^(default|defaults)$/i.test(key.trim())) return {};
  return Object.fromEntries(key.trim().split(/\s+/).map((pair) => pair.split('=') as [string, string]));
}

/** Adds the accepted issue to a stories file: axe reports instead of failing, in every mode or only in the listed ones. */
export function acceptKnownIssue(stories: string, issue: string | Record<string, string>): string {
  const clean = (t: string) => t.replace(/\*\//g, '').replace(/\n/g, ' ');
  if (typeof issue === 'string') {
    return stories.replace(/parameters: \{ ?/, `parameters: {\n    // Known design issue (ds-sync.config.json overrides.knownIssues): ${clean(issue)}\n    a11y: { test: 'todo' },\n    `);
  }
  const lines = Object.entries(issue).map(([mode, why]) => `    //   ${mode}: ${clean(why)}`);
  const modes = Object.keys(issue).map((k) => JSON.stringify(parseModeKey(k))).join(', ');
  const withImport = stories.replace(/^(import [^\n]*'storybook\/test';|import [^\n]*from 'lit';|import type \{ Meta, StoryObj \} from '@storybook\/react-vite';)\n/m, `$1\nimport { inModes } from '../../storybook/modes';\n`);
  return withImport.replace(/parameters: \{ ?/, `parameters: {\n    // Known design issues (ds-sync.config.json overrides.knownIssues), accepted only in these Figma modes:\n${lines.join('\n')}\n    a11y: { test: inModes(${modes}) ? 'todo' : 'error' },\n    `);
}

function knownIssueNotes(issue: string | Record<string, string>): string[] {
  return typeof issue === 'string'
    ? [`Known design issue (accessibility checks report instead of failing): ${issue}`]
    : Object.entries(issue).map(([mode, why]) => `Known design issue in ${mode} (accessibility checks report instead of failing there): ${why}`);
}

/** Storybook's story id: "Components/Radio/RadioControl" + "FigmaVariants" -> "components-radio-radiocontrol--figma-variants". */
export function storyId(title: string, exportName: string): string {
  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug(title)}--${slug(exportName.replace(/([a-z0-9])([A-Z])/g, '$1-$2'))}`;
}

/** What "ds-sync visual" compares: per component, the Figma variants and the story that renders them. */
function visualManifest(ir: FigmaIR, results: { c: PlannedComponent; result: TemplateResult }[]) {
  return {
    note: 'Written by ds-sync generate; read by ds-sync visual. Figma renders come from this file key and version.',
    fileKey: ir.fileKey,
    version: ir.version,
    components: results.flatMap(({ c, result }) => {
      const visual = (result.core as GenericCore | undefined)?.visual;
      return visual ? [{ name: c.name, story: storyId(c.title ?? `Components/${c.name}`, 'FigmaVariants'), variants: visual }] : [];
    }),
    notCovered: results.filter(({ result }) => !(result.core as GenericCore | undefined)?.visual).map(({ c }) => c.name),
  };
}

/** Generated folders are replaced; files are only written under them, so the target stays clean between runs. */
const OWNED = ['src', '.storybook', 'types'];

/** Descriptions by code prop, and the component description, from the applied decisions. */
function decisionDocs(sets: IRComponentSet[]): { descriptions?: Record<string, string>; decidedDescription?: string } {
  const descriptions: Record<string, string> = {};
  for (const set of sets) {
    const plan = propPlan(set);
    for (const a of plan.axes) if (a.description) descriptions[a.prop] = a.description;
    for (const b of [...plan.booleans, ...plan.texts]) if (b.description) descriptions[b.prop] = b.description;
  }
  const decided = sets.map((s) => decidedSetDescription(s)).find(Boolean);
  return { ...(Object.keys(descriptions).length ? { descriptions } : {}), ...(decided ? { decidedDescription: decided } : {}) };
}

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
  // Decisions: validated against this IR; entries with errors are left out and reported, never half-applied.
  const decisionsFile = loadDecisions(resolve(config.baseDir, gen.decisions?.file ?? DECISIONS_FILE));
  const decisionLevel: ApplyLevel = gen.decisions?.apply ?? 'accepted';
  const decisionProblems = decisionsFile ? validateDecisions(decisionsFile, ir) : [];
  if (decisionsFile) {
    const usable: DecisionsFile = JSON.parse(JSON.stringify(decisionsFile)) as DecisionsFile;
    for (const pr of decisionProblems.filter((x) => x.severity === 'error')) {
      if (pr.prop) delete usable.sets[pr.set]?.props?.[pr.prop];
      else delete usable.sets[pr.set];
    }
    setActiveDecisions(activeDecisions(usable, decisionLevel));
    for (const pr of decisionProblems) log(`Decisions ${pr.severity}: ${pr.set}${pr.prop ? ` › ${pr.prop}` : ''}: ${pr.message}`);
    const active = activeDecisions(usable, decisionLevel);
    log(`Decisions: ${Object.keys(decisionsFile.sets).length} set(s) in ${gen.decisions?.file ?? DECISIONS_FILE}; applying ${decisionLevel} → ${active.size} set(s)`);
  } else setActiveDecisions(new Map());
  const usedTargets = plan.flatMap((c) => Object.values(c.sets));
  const missing = usedTargets.filter((t) => !setsById.has(t));
  if (missing.length) throw new Error(`Component sets missing from the IR: ${missing.join(', ')}. Run "extract" first.`);

  // Fonts: loaded from npm packages; system and missing families are reported.
  const fonts = await planFonts(usedFonts(ir), gen.fonts === false ? undefined : httpFontSource(join(config.baseDir, '.ds-sync', 'fonts.json')), gen.fonts || {});
  setFontStacks(Object.fromEntries(fonts.filter((f) => f.family !== 'Inter').map((f) => [f.family, f.stack])));
  setBreakpoints(gen.breakpoints);
  const fontPackages = fonts.filter((f) => f.package && f.package !== '@fontsource-variable/inter');
  const fontDeps = Object.fromEntries(fontPackages.filter((f) => f.version).map((f) => [f.package!, f.version!]));
  const fontImports = [...new Set(fontPackages.flatMap((f) => f.imports ?? []))];
  for (const f of fonts.filter((x) => x.status === 'missing' || x.status === 'substitute')) log(`Font ${f.family}: ${f.status} (${f.note ?? ''})`);
  log(`Fonts: ${fonts.filter((f) => f.status === 'package' || f.status === 'configured').length} loaded, ${fonts.filter((f) => f.status === 'substitute').length} substituted, ${fonts.filter((f) => f.status === 'system').length} system, ${fonts.filter((f) => f.status === 'missing').length} missing`);

  const icons: IconAsset[] = await exportIcons(renderer, ir, iconRefs(ir, usedTargets));
  log(`Icons: ${icons.length} exported as SVG`);
  await exportShapes(renderer, ir, usedTargets, log);
  const iconMap = new Map(icons.map((i) => [i.figmaName, i]));

  // Nested instances: a variant node id of a generated set -> the component that renders it.
  const registry = new Map<string, RegistryEntry>();
  for (const c of plan) {
    if (c.template === 'checkbox' || c.template === 'accordion') continue;
    const set = setsById.get(c.sets.main ?? '');
    if (!set) continue;
    const entry: RegistryEntry = { component: c.name, importPath: `../${c.name}/${c.name}`, kind: c.template === 'checkbox-single' ? 'switch' : c.template, set };
    for (const v of set.variants) registry.set(v.nodeId, entry);
  }
  const lookupEntry = (id: string) => registry.get(id);

  // Sidebar: category titles from configuration, and building blocks (Figma's "_" / "." / "Base" convention, or configuration).
  for (const c of plan) {
    const cat = Object.entries(gen.categories ?? {}).find(([, names]) => names.includes(c.name))?.[0];
    if (!c.title && cat) c.title = `Components/${cat}/${c.name}`;
  }
  const titleOf = (c: PlannedComponent) => c.title ?? `Components/${c.name}`;
  const blockOf = (c: PlannedComponent) => !gen.publicComponents?.includes(c.name) && (Boolean(gen.internalComponents?.includes(c.name)) || isBuildingBlock(setsById.get(c.sets.main ?? '')?.name ?? c.name));

  const files: GeneratedFile[] = [];
  const reports: ComponentReport[] = [];
  const results: { c: PlannedComponent; ctx: TemplateContext; result: TemplateResult }[] = [];
  for (const c of plan) {
    const sets: Record<string, IRComponentSet> = Object.fromEntries(Object.entries(c.sets).map(([role, id]) => [role, setsById.get(id)!]));
    const ctx: TemplateContext = { fileKey: ir.fileKey, version: ir.version, sets, resolver, icons: iconMap };
    const radioControl = plan.find((x) => x.template === 'radio');
    const radioSet = radioControl ? setsById.get(radioControl.sets.main ?? '') : undefined;
    const result = c.template !== 'action' && c.template !== 'checkbox' && c.template !== 'accordion'
      ? genericTemplate(ctx, c.name, {
          title: c.title ?? `Components/${c.name}`,
          ...(c.template !== 'generic' ? { behavior: c.template } : {}),
          ...(radioControl && radioSet ? { related: { control: { name: radioControl.name, set: radioSet } } } : {}),
          instance: (part) => {
            const entry = part.instanceComponentId ? registry.get(part.instanceComponentId) : undefined;
            return entry ? instanceRef(entry, part, iconMap, lookupEntry) : undefined;
          },
          lookup: lookupEntry,
        })
      : SPECIALISED[c.template](ctx, c.name);
    const issue = gen.overrides?.knownIssues?.[c.name];
    if (issue) {
      // Accepted design issue: axe still runs and reports, but does not fail the story tests (in the listed modes).
      for (const f of result.files) if (f.path.endsWith('.stories.tsx')) f.content = acceptKnownIssue(f.content, issue);
      result.report.gaps.push(...knownIssueNotes(issue));
    }
    files.push(...result.files);
    reports.push(result.report);
    results.push({ c, ctx, result });
    log(`${c.name}: template ${c.template}`);
  }

  // Documentation pass (STANDARD.md): story names, sidebar visibility, tiered docs page. Same for every target.
  const byId = new Map<string, PlannedComponent>();
  for (const c of plan) for (const v of setsById.get(c.sets.main ?? '')?.variants ?? []) byId.set(v.nodeId, c);
  const componentOf = (id: string) => { const c = byId.get(id); return c ? { name: c.name, title: titleOf(c), buildingBlock: blockOf(c) } : undefined; };
  const compositions = new Map(results.map(({ c, result }) => [c.name, composition(result.core as GenericCore | undefined, componentOf)]));
  let visual: Record<string, { match: number; total: number; worst: number }> = {};
  try {
    const summary = readJson(join(config.baseDir, '.ds-sync', 'visual', 'summary.json')) as { version?: string; results?: { component: string; verdict: string; diff: number }[] };
    if (summary.version === ir.version) for (const r of summary.results ?? []) {
      const v = (visual[r.component] ??= { match: 0, total: 0, worst: 0 });
      v.total++;
      if (r.verdict === 'match') v.match++;
      v.worst = Math.max(v.worst, r.diff);
    }
  } catch { visual = {}; }
  const modeNames = [...new Set(Object.values(tokens.modes).flat())];
  // Scorecards (QUALITY.md section 3): per component, one status per measure.
  const issueCount = (i: string | Record<string, string> | undefined) => (!i ? 0 : typeof i === 'string' ? 1 : Object.keys(i).length);
  const cards = results.map(({ c, ctx, result }) => {
    const sets = Object.values(ctx.sets);
    const docs = decisionDocs(sets);
    return buildScorecard({
      name: c.name, template: c.template, sets, report: result.report,
      css: (result.core as GenericCore | undefined)?.css ?? result.files.find((f) => f.path.endsWith('.module.css'))?.content ?? '',
      buildingBlock: blockOf(c), ...(visual[c.name] ? { visual: visual[c.name] } : {}),
      knownIssues: issueCount(gen.overrides?.knownIssues?.[c.name]),
      questions: sets.reduce((n, s) => n + (decisionsFile?.sets[s.name]?.questions?.length ?? 0), 0),
      described: sets.some((s) => s.description.trim()) || Boolean(leadSentence(sets.flatMap((s) => s.docFrames))) || Boolean(docs.decidedDescription),
      describedProps: Object.keys(docs.descriptions ?? {}).length,
    });
  });
  const cardOf = new Map(cards.map((x) => [x.component, x]));
  const applyDocs = (list: GeneratedFile[], framework: 'react' | 'wc', packageName: string) => {
    for (const { c, ctx, result } of results) {
      const dir = `src/components/${c.name}/`;
      const page = list.find((f) => f.path.startsWith(dir) && f.path.endsWith('.mdx'));
      const stories = list.find((f) => f.path.startsWith(dir) && /\.stories\.tsx?$/.test(f.path));
      const block = blockOf(c);
      const title = titleOf(c);
      const sections = page ? templateSections(page.content) : [];
      if (stories) {
        stories.content = polishStories(stories.content.replace(`title: 'Components/${c.name}',`, `title: ${JSON.stringify(title)},`), { name: c.name, documented: new Set(sections.map((x) => x.story)), buildingBlock: block });
      }
      if (!page) continue;
      const core = result.core as GenericCore | undefined;
      const comp = compositions.get(c.name) ?? [];
      const exposed = (core?.exposed ?? []).map((e) => ({ prop: e.prop, layer: e.exposed!.name, figma: e.figma, component: e.exposed!.entry.component }));
      const issue = gen.overrides?.knownIssues?.[c.name];
      page.content = docsPage({
        name: c.name, title, framework,
        tier: c.template === 'accordion' || comp.length || exposed.length ? 3 : c.template === 'generic' ? 1 : 2,
        sets: Object.values(ctx.sets), fileKey: ir.fileKey, version: ir.version, report: result.report,
        composition: comp, exposed, templateMdx: page.content, buildingBlock: block,
        usedIn: results.filter((x) => (compositions.get(x.c.name) ?? []).some((r) => r.component === c.name)).map((x) => ({ name: x.c.name, title: titleOf(x.c) })),
        knownIssues: issue ? knownIssueNotes(issue) : [], modes: modeNames, packageName,
        ...(visual[c.name] ? { visual: visual[c.name] } : {}),
        ...decisionDocs(Object.values(ctx.sets)),
        ...(cardOf.get(c.name) ? { scorecard: scorecardLines(cardOf.get(c.name)!) } : {}),
      });
    }
  };

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
    { path: 'GENERATION-REPORT.md', content: report(ir, reports, tokenMap.counts, icons, fonts, [...scorecardReport(cards), ...decisionsReport(decisionsFile, decisionLevel, decisionProblems)]) },
    { path: 'scorecard.json', content: JSON.stringify({ fileKey: ir.fileKey, version: ir.version, components: cards }, null, 2) + '\n' },
  ];

  const targets: TargetConfig[] = gen.targets?.length ? gen.targets : [{ target: gen.target ?? 'react', outDir: gen.outDir, ...(gen.packageName ? { packageName: gen.packageName } : {}) }];
  const written: { target: Target; outDir: string; files: string[] }[] = [];
  for (const t of targets) {
    const outFiles: GeneratedFile[] = [...shared];
    const packageName = t.packageName ?? gen.packageName ?? 'figma-storybook';
    if (t.target === 'react') {
      applyDocs(files, 'react', packageName);
      outFiles.push(
        ...files,
        ...projectFiles({ name: packageName, figma: { fileKey: ir.fileKey, fileName: ir.fileName, version: ir.version }, modes: tokens.modes, modeAttributes, components: plan.map((c) => c.name), icons, colorTokens, page, fonts: { deps: fontDeps, imports: fontImports } }),
        { path: 'README.md', content: readme(ir, plan, 'react') },
        { path: 'visual-manifest.json', content: JSON.stringify(visualManifest(ir, results), null, 2) + '\n' },
      );
    } else {
      const prefix = gen.tagPrefix ?? 'ds';
      const o = { prefix, packageName };
      const tagOf = (component: string) => tagFor(prefix, component);
      const wc: { name: string; r: WcResult }[] = [];
      for (const { c, ctx, result } of results) {
        let r: WcResult;
        if (c.template !== 'action' && c.template !== 'checkbox' && c.template !== 'accordion') {
          r = wcGeneric(ctx, c.name, result.core as GenericCore, o, (part) => {
            const entry = part.instanceComponentId ? registry.get(part.instanceComponentId) : undefined;
            return entry ? instanceRef(entry, part, iconMap, lookupEntry) : undefined;
          }, tagOf);
        } else if (c.template === 'action') r = wcAction(ctx, c.name, result.core as ActionCore, o);
        else if (c.template === 'checkbox') r = wcCheckbox(ctx, c.name, result.core as CheckboxCore, o);
        else r = wcAccordion(ctx, c.name, result.core as AccordionCore, o);
        const issue = gen.overrides?.knownIssues?.[c.name];
        if (issue) for (const f of r.files) if (f.path.endsWith('.stories.ts')) f.content = acceptKnownIssue(f.content, issue);
        wc.push({ name: c.name, r });
        outFiles.push(...r.files);
      }
      applyDocs(wc.flatMap((x) => x.r.files), 'wc', packageName);
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
          fonts: { deps: fontDeps, imports: fontImports },
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

function report(ir: FigmaIR, reports: ComponentReport[], counts: Record<string, number>, icons: IconAsset[], fonts: FontPlan[] = [], decisionLines: string[] = []): string {
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
    ...fontsReport(fonts),
    ...decisionLines,
  ];
  const nested = reports.filter((r) => r.nested);
  if (nested.length) {
    const checked = nested.reduce((n, r) => n + r.nested!.checked, 0);
    const matched = nested.reduce((n, r) => n + r.nested!.matched, 0);
    lines.push(
      '## Nested consistency',
      '',
      'For each nested component and each parent variant in its base state, the props the generated parent gives the nested component, compared with the Figma instance (its variant, booleans, texts and exposed nested instances).',
      '',
      `Overall: ${matched}/${checked} values match${checked ? ` (${Math.round((matched / checked) * 1000) / 10}%)` : ''}.`,
      '',
      '| Component | Nested layers | Match | Not compared (state variants) |',
      '| --- | --- | --- | --- |',
      ...nested.map((r) => `| ${r.name} | ${r.nested!.layers} | ${r.nested!.matched}/${r.nested!.checked} | ${r.nested!.stateVariants} |`),
      '',
    );
  }
  for (const r of reports) {
    lines.push(`## ${r.name}`, '', `Figma: ${r.figmaSets.join(', ')}`, '', '| Figma | Prop | Note |', '| --- | --- | --- |');
    for (const p of r.props) lines.push(`| ${p.figma} | \`${p.prop}\` | ${p.note ?? ''} |`);
    lines.push('', '**Not from Figma (archetype defaults or decisions):**', '', ...r.assumptions.map((a) => `- ${a}`), '');
    if (r.gaps.length) lines.push('**Gaps:**', '', ...r.gaps.map((g) => `- ${g}`), '');
    if (r.nested?.mismatches.length) {
      lines.push('<details><summary>Nested values Figma sets that the generated props cannot express</summary>', '', '| Layer | Parent variant | Prop | Code | Figma |', '| --- | --- | --- | --- | --- |',
        ...r.nested.mismatches.map((m) => `| ${m.layer}${m.copy ? ` (copy ${m.copy})` : ''} | ${m.variant} | \`${m.prop}\` | ${m.code} | ${m.figma} |`), '', '</details>', '');
    }
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
