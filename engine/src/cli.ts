#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig } from './config.ts';
import { FigmaClient } from './figma/client.ts';
import { discover, discoveryMarkdown, targetsFromDiscovery, type Discovery } from './discover/discover.ts';
import { generateStorybook, type PlannedComponent } from './generate/index.ts';
import { runInit } from './init.ts';
import { runVisual, verdict } from './visual/visual.ts';
import { changeImages, changesMarkdown, diffIR, type ChangeSet } from './changes/changes.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const writeBinary = (path: string, data: Buffer) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};
import type { FigmaIR } from './ir/types.ts';
import { existsSync as exists, readFileSync } from 'node:fs';
import { extractIR } from './ir/extract.ts';
import { loadIR, paths, stepAnalyze, stepExtract, stepReport, stepSpecs } from './pipeline.ts';
import { loadDotEnv, writeJson, writeText } from './util/core.ts';

const USAGE = `ds-sync — generate and sync a tested Storybook from a Figma design system

Usage: npx ds-sync <command> [options]

Commands:
  init      Set up this folder: Figma link, token, stack detection → ds-sync.config.json
  extract   Read Figma (REST) into out/figma-ir.json        (needs FIGMA_TOKEN)
  spec      Build out/specs/*.spec.yaml from the IR
  analyze   Read the code repo into out/code-ir.json
  report    Diff specs against code → out/report.html + report.json
  run       All of the above, in order
  discover  Find every component set and classify frames → out/discovery.md
  generate  Build a fresh Storybook project from Figma (auto-discovers components
            unless "generate.components" is set in the config)
  status    Is Figma newer than the generated output? (one API call; for CI)
  changes   What changed in Figma since a version → out/changes.md (+ .json); generate writes it too
  visual    Compare every Figma variant with the generated Storybook, pixel by pixel
            → out/visual/report.html (needs a running React Storybook: --url)

Options:
  --config <file>   Config file (default: ds-sync.config.json)
  --out <dir>       Working directory for reports and cache (default: .ds-sync)
  --figma-version <id>  Read this Figma version instead of the latest (discover, generate)
  changes: --since <version> (default: the version of the generated output)  --figma-version <to>
  visual: --url <storybook url> (default http://localhost:6006)  --dir <React Storybook folder>  --only <A,B>
  init:  --figma <link>  --target react|web-components|both  --dir <folder>  --variables <file>  --ci  --yes
  --refresh         Ignore the Figma response cache
  --help            Show this help
`;

function figmaClient() {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error('FIGMA_TOKEN is not set. Copy .env.example to .env and add a Figma personal access token.');
  return new FigmaClient({ token, cacheDir: CTX.cache, log: CTX.log, ...(CTX.refresh ? { refresh: true } : {}) });
}

/** "↳ Date Picker" -> "Date Picker". */
function pageLabel(page: string): string {
  const t = page.replace(/^[^A-Za-z0-9]+/, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const CTX = { cache: '', out: '', fileKey: '', version: undefined as string | undefined, refresh: false, overrides: {} as NonNullable<NonNullable<ReturnType<typeof loadConfig>['generate']>['overrides']>, log: (_m: string) => {} };

async function runDiscovery(client: FigmaClient): Promise<Discovery> {
  const d = await discover(client, CTX.fileKey, CTX.overrides, CTX.log, CTX.version);
  writeJson(join(CTX.out, 'discovery.json'), d);
  writeText(join(CTX.out, 'discovery.md'), discoveryMarkdown(d));
  CTX.log(`Discovery → ${join(CTX.out, 'discovery.md')} (${d.proposals.length} components, ${d.review.length} to review)`);
  return d;
}

/** The Figma version the generated output was built from (its GENERATION-REPORT.md), if any. */
function generatedVersion(config: ReturnType<typeof loadConfig>): string | undefined {
  const g = config.generate;
  const dirs = g?.targets?.length ? g.targets.map((t) => t.outDir) : g ? [g.outDir] : [];
  for (const d of dirs) {
    const f = join(config.baseDir, d, 'GENERATION-REPORT.md');
    const m = exists(f) ? /version (\d+)/.exec(readFileSync(f, 'utf8')) : null;
    if (m) return m[1];
  }
  return undefined;
}

/** Diffs the Figma file at an earlier version against an IR already read at the new one; writes changes.md and .json. */
async function writeChanges(client: FigmaClient, config: ReturnType<typeof loadConfig>, since: string, after: FigmaIR, names: Record<string, string>): Promise<ChangeSet> {
  CTX.log(`Changes: reading Figma version ${since} to compare`);
  const quiet = () => {};
  const old = await discover(client, CTX.fileKey, CTX.overrides, quiet, since);
  const before = await extractIR(client, { ...config, components: targetsFromDiscovery(old) }, quiet, since);
  const changes = diffIR(before, after, names);
  const imagesDir = join(CTX.out, 'changes');
  const shown = await changeImages(client, changes, imagesDir, (path, data) => (typeof data === 'string' ? writeText(path, data) : writeBinary(path, data)));
  if (shown) CTX.log(`Changes: before/after Figma renders of ${shown} variant(s) → ${join(imagesDir, 'changes.html')}`);
  writeJson(join(CTX.out, 'changes.json'), changes);
  writeText(join(CTX.out, 'changes.md'), changesMarkdown(changes));
  CTX.log(`Changes → ${join(CTX.out, 'changes.md')}: ${changes.components.length ? changes.components.map((c) => `${c.component} (${c.kinds.join(', ')})`).join('; ') : 'no component changes'}`);
  return changes;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', default: 'ds-sync.config.json' },
      out: { type: 'string', default: '.ds-sync' },
      figma: { type: 'string' },
      target: { type: 'string' },
      'figma-version': { type: 'string' },
      dir: { type: 'string' },
      url: { type: 'string' },
      only: { type: 'string' },
      since: { type: 'string' },
      variables: { type: 'string' },
      yes: { type: 'boolean', default: false },
      ci: { type: 'boolean', default: false },
      refresh: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return;
  }
  const log = (m: string) => process.stderr.write(`· ${m}\n`);
  if (command === 'init') {
    await runInit({ ...(values.figma ? { figma: values.figma } : {}), ...(values.target ? { target: values.target } : {}), ...(values.dir ? { dir: values.dir } : {}), ...(values.variables ? { variables: values.variables } : {}), yes: values.yes!, ci: values.ci!, log });
    return;
  }
  if (!existsSync(values.config!)) throw new Error(`${values.config} not found. Run "npx ds-sync init" first.`);
  const config = loadConfig(values.config!);
  loadDotEnv(join(config.baseDir, '.env'));
  const p = paths(config, values.out);
  Object.assign(CTX, { cache: p.cache, out: p.out, fileKey: config.figma.fileKey, version: values['figma-version'], refresh: values.refresh!, overrides: config.generate?.overrides ?? {}, log });

  switch (command) {
    case 'extract': {
      const ir = await stepExtract(config, p, { refresh: values.refresh!, log });
      log(`IR: ${ir.components.length} component set(s), ${ir.missing.length} missing → ${p.ir}`);
      break;
    }
    case 'spec': {
      const specs = stepSpecs(config, p, loadIR(p));
      log(`Specs: ${specs.length} → ${p.specs}`);
      break;
    }
    case 'analyze': {
      const codeIR = stepAnalyze(config, p);
      log(`Code IR: ${codeIR.components.filter((c) => c.found).length}/${codeIR.components.length} component(s) found, ${codeIR.tokenVars.length} token vars → ${p.codeIr}`);
      break;
    }
    case 'report':
    case 'run': {
      const ir = command === 'run' ? await stepExtract(config, p, { refresh: values.refresh!, log }) : loadIR(p);
      const specs = stepSpecs(config, p, ir);
      const codeIR = stepAnalyze(config, p);
      const drifts = stepReport(config, p, ir, specs, codeIR);
      for (const d of drifts) {
        const n = (s: string) => d.findings.filter((f) => f.severity === s).length;
        log(`${d.name.padEnd(18)} errors ${n('error')}  warnings ${n('warning')}  info ${n('info')}`);
      }
      log(`Report → ${p.reportHtml}`);
      break;
    }
    case 'outputs': {
      // For CI: the generated folders, in GitHub Actions output format.
      const g = config.generate;
      const dirs = g?.targets?.length ? g.targets.map((t) => t.outDir) : g ? [g.outDir] : [];
      const react = g?.targets?.find((t) => t.target === 'react')?.outDir ?? (g && (g.target ?? 'react') === 'react' ? g.outDir : '');
      const changesFile = join(p.out, 'changes.json');
      const labels = exists(changesFile) ? (JSON.parse(readFileSync(changesFile, 'utf8')) as ChangeSet).labels : [];
      const summary = join(p.out, 'changes.md');
      process.stdout.write(`dirs=${dirs.join(' ')}\nreact_dir=${react}\nlabels=${labels.join(',')}\nsummary=${exists(summary) ? summary : ''}\npaths<<EOF\n${dirs.map((d) => `${d}/**`).join('\n')}\nEOF\n`);
      break;
    }
    case 'status': {
      // For CI: one cheap call (no document tree) to see whether Figma moved since the last generation.
      const latest = (await new FigmaClient({ token: process.env.FIGMA_TOKEN ?? '', cacheDir: CTX.cache, refresh: true }).file(CTX.fileKey, 1)).version;
      const generated = generatedVersion(config) ?? '';
      const changed = latest !== generated;
      log(changed ? `Figma version ${latest}; generated from ${generated || 'nothing yet'}: regenerate.` : `Figma is still at version ${latest}, the generated version: nothing to do.`);
      process.stdout.write(`figma_version=${latest}\ngenerated_version=${generated}\nchanged=${changed}\n`);
      break;
    }
    case 'discover': {
      const client = figmaClient();
      const d = await runDiscovery(client);
      for (const r of d.review) log(`review: ${r.item}: ${r.question}`);
      break;
    }
    case 'generate': {
      if (!config.generate) throw new Error('No "generate" section in the config.');
      const client = figmaClient();
      const auto = config.generate.mode === 'auto' || !config.generate.components?.length;
      let ir;
      let plan: PlannedComponent[] | undefined;
      if (auto) {
        const d = await runDiscovery(client);
        const targets = targetsFromDiscovery(d);
        ir = await extractIR(client, { ...config, components: targets }, log, CTX.version);
        writeJson(join(p.out, 'figma-ir.auto.json'), ir);
        const perPage = new Map<string, number>();
        for (const x of d.proposals) perPage.set(x.page, (perPage.get(x.page) ?? 0) + 1);
        plan = d.proposals.map((x) => ({
          name: x.name,
          template: x.template,
          sets: Object.fromEntries(Object.entries(x.sets).map(([role, id]) => [role, `auto.${id}`])),
          title: (perPage.get(x.page) ?? 0) > 1 ? `Components/${pageLabel(x.page)}/${x.name}` : `Components/${x.name}`,
        }));
        if (ir.missing.length) log(`Not extracted: ${ir.missing.map((m) => m.targetId).join(', ')}`);
      } else {
        ir = values.refresh ? await stepExtract(config, p, { refresh: true, log }) : loadIR(p);
      }
      const previous = generatedVersion(config);
      const res = await generateStorybook(config, config.generate, ir, client, log, plan);
      if (previous && previous !== ir.version && plan) {
        const names = Object.fromEntries(plan.flatMap((c) => Object.values(c.sets).map((id) => [id.replace(/^auto\./, ''), c.name])));
        await writeChanges(client, config, previous, ir, names);
      }
      log(`Tokens: ${res.tokenCounts.bound} bound, ${res.tokenCounts.rawInFigma} raw in Figma, ${res.tokenCounts.noMatchingToken} unmatched`);
      log(`Storybook project: ${res.files.length} files → ${res.outDir}`);
      break;
    }
    case 'changes': {
      const since = values.since ?? generatedVersion(config);
      if (!since) throw new Error('No --since version, and no generated output to read it from.');
      const client = figmaClient();
      const d = await runDiscovery(client);
      const after = await extractIR(client, { ...config, components: targetsFromDiscovery(d) }, log, CTX.version);
      const names = Object.fromEntries(d.proposals.flatMap((x) => Object.values(x.sets).map((id) => [id, x.name])));
      if (since === after.version) log(`Figma is still at version ${since}: nothing changed.`);
      await writeChanges(client, config, since, after, names);
      break;
    }
    case 'visual': {
      const g = config.generate;
      const react = g?.targets?.find((t) => t.target === 'react')?.outDir ?? (g && (g.target ?? 'react') === 'react' ? g.outDir : undefined);
      const dir = resolve(config.baseDir, values.dir ?? react ?? 'storybook');
      const { results } = await runVisual(figmaClient(), { dir, url: values.url ?? 'http://localhost:6006', outDir: join(p.out, 'visual'), ...(values.only ? { only: values.only.split(',').map((x) => x.trim()) } : {}), log });
      const counts: Record<'match' | 'check' | 'differs' | 'error', number> = { match: 0, check: 0, differs: 0, error: 0 };
      for (const r of results) counts[verdict(r)]++;
      log(`Visual: ${results.length} variants: ${counts.match} match, ${counts.check} to check, ${counts.differs + counts.error} differ`);
      break;
    }
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`ds-sync: ${message}\n`);
  // In GitHub Actions, also emit an annotation so the reason shows on the run page and in the API.
  if (process.env.GITHUB_ACTIONS) process.stdout.write(`::error title=ds-sync::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}\n`);
  process.exitCode = 1;
});
