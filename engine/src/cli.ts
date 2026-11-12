#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig } from './config.ts';
import { FigmaClient } from './figma/client.ts';
import { discover, discoveryMarkdown, targetsFromDiscovery, type Discovery } from './discover/discover.ts';
import { generateStorybook, type PlannedComponent } from './generate/index.ts';
import { runInit } from './init.ts';
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

Options:
  --config <file>   Config file (default: ds-sync.config.json)
  --out <dir>       Working directory for reports and cache (default: .ds-sync)
  --figma-version <id>  Read this Figma version instead of the latest (discover, generate)
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
      process.stdout.write(`dirs=${dirs.join(' ')}\npaths<<EOF\n${dirs.map((d) => `${d}/**`).join('\n')}\nEOF\n`);
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
      const res = await generateStorybook(config, config.generate, ir, client, log, plan);
      log(`Tokens: ${res.tokenCounts.bound} bound, ${res.tokenCounts.rawInFigma} raw in Figma, ${res.tokenCounts.noMatchingToken} unmatched`);
      log(`Storybook project: ${res.files.length} files → ${res.outDir}`);
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
