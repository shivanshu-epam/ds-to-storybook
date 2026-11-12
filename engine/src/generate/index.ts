/** Scenario 2: Figma design system -> a fresh, tested Storybook project. */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { LoadedConfig } from '../config.ts';
import type { FigmaRenderer } from '../figma/client.ts';
import type { FigmaIR, IRComponentSet } from '../ir/types.ts';
import { expandHome, readJson, writeText } from '../util/core.ts';
import { exportIcons, iconRefs, type IconAsset } from './icons.ts';
import { projectFiles } from './project.ts';
import { accordionTemplate } from './templates/accordion.ts';
import { actionTemplate } from './templates/action.ts';
import { checkboxTemplate } from './templates/checkbox.ts';
import type { ComponentReport, GeneratedFile, TemplateContext, TemplateResult } from './templates/common.ts';
import { loadTokens, resolveDefault, TokenResolver, tokensCss } from './tokens.ts';

export interface GenerateConfig {
  /** Output directory, relative to the config file. */
  outDir: string;
  /** Package name of the generated project. */
  packageName?: string;
  /** Figma variables export (stand-in for the Enterprise Variables API or a plugin export). */
  variablesExport: string;
  /** Variable collection -> HTML attribute that selects its non-default modes. */
  modeAttributes?: Record<string, string>;
  components: { name: string; template: 'action' | 'checkbox' | 'accordion'; sets: Record<string, string> }[];
}

const TEMPLATES: Record<GenerateConfig['components'][number]['template'], (ctx: TemplateContext, name: string) => TemplateResult> = {
  action: actionTemplate,
  checkbox: checkboxTemplate,
  accordion: accordionTemplate,
};

/** Generated folders are replaced; files are only written under them, so the target stays clean between runs. */
const OWNED = ['src', '.storybook'];

export async function generateStorybook(config: LoadedConfig, gen: GenerateConfig, ir: FigmaIR, renderer: FigmaRenderer, log: (m: string) => void) {
  const outDir = resolve(config.baseDir, gen.outDir);
  const tokens = loadTokens(readJson(resolve(config.baseDir, expandHome(gen.variablesExport))));
  const resolver = new TokenResolver(tokens);
  const modeAttributes = gen.modeAttributes ?? {};

  const setsById = new Map(ir.components.map((c) => [c.targetId, c]));
  const usedTargets = gen.components.flatMap((c) => Object.values(c.sets));
  const missing = usedTargets.filter((t) => !setsById.has(t));
  if (missing.length) throw new Error(`Component sets missing from the IR: ${missing.join(', ')}. Run "extract" first.`);

  const icons: IconAsset[] = await exportIcons(renderer, ir, iconRefs(ir, usedTargets));
  log(`Icons: ${icons.length} exported as SVG`);
  const iconMap = new Map(icons.map((i) => [i.figmaName, i]));

  const files: GeneratedFile[] = [];
  const reports: ComponentReport[] = [];
  for (const c of gen.components) {
    const sets: Record<string, IRComponentSet> = Object.fromEntries(Object.entries(c.sets).map(([role, id]) => [role, setsById.get(id)!]));
    const ctx: TemplateContext = { fileKey: ir.fileKey, version: ir.version, sets, resolver, icons: iconMap };
    const result = TEMPLATES[c.template](ctx, c.name);
    files.push(...result.files);
    reports.push(result.report);
    log(`${c.name}: ${result.files.length} files (template ${c.template})`);
  }

  const colorTokens = tokens.rows
    .filter((r) => r.collection === 'semantic.color')
    .map((r) => ({ name: r.name, cssVar: r.cssVar }));
  files.push(
    { path: 'src/tokens/tokens.css', content: tokensCss(tokens, modeAttributes) },
    ...projectFiles({
      name: gen.packageName ?? 'figma-storybook',
      figma: { fileKey: ir.fileKey, fileName: ir.fileName, version: ir.version },
      modes: tokens.modes,
      modeAttributes,
      components: gen.components.map((c) => c.name),
      icons,
      colorTokens,
      page: {
        background: tokens.rows.find((r) => r.collection === 'semantic.color' && /^surface\/bg\/default$/.test(r.name))?.cssVar,
        text: tokens.rows.find((r) => r.collection === 'semantic.color' && /^text\/(primary|default)$/.test(r.name))?.cssVar,
      },
    }),
  );

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
  files.push({ path: 'token-map.json', content: JSON.stringify(tokenMap, null, 2) + '\n' });
  files.push({ path: 'GENERATION-REPORT.md', content: report(ir, reports, tokenMap.counts, icons) });
  files.push({ path: 'README.md', content: readme(ir, gen) });

  // Replace generated folders, keep anything else (node_modules, user files) in place.
  for (const dir of OWNED) {
    const abs = join(outDir, dir);
    if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
  }
  for (const f of files) writeText(join(outDir, f.path), f.content);
  return { outDir, files: files.map((f) => f.path), reports, tokenCounts: tokenMap.counts };
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

function readme(ir: FigmaIR, gen: GenerateConfig): string {
  return `# Storybook generated from Figma

Generated by the ds-sync engine from the Figma file "${ir.fileName}" (\`${ir.fileKey}\`), version ${ir.version}.
Components: ${gen.components.map((c) => c.name).join(', ')}.

\`\`\`bash
npm install
npm run storybook    # http://localhost:6006
npm test             # every story: render, interactions, accessibility (axe)
npm run typecheck
\`\`\`

- \`src/tokens/tokens.css\`: every Figma variable as a CSS custom property, with modes as \`data-*\` attributes.
- \`src/components/*\`: React components, CSS modules, stories, MDX docs and the Figma docs text (\`*.figma.json\`).
- \`GENERATION-REPORT.md\`: what came from Figma, what came from archetype defaults, and the gaps.
- \`token-map.json\`: how each Figma value was mapped to a token.

Everything under \`src/\` and \`.storybook/\` is regenerated. To change it, change Figma or the generator, not these files.
`;
}

export function listFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir) : [];
}
