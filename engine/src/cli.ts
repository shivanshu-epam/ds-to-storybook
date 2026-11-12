#!/usr/bin/env node
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig } from './config.ts';
import { FigmaClient } from './figma/client.ts';
import { generateStorybook } from './generate/index.ts';
import { loadIR, paths, stepAnalyze, stepExtract, stepReport, stepSpecs } from './pipeline.ts';
import { loadDotEnv } from './util/core.ts';

const USAGE = `ds-sync — Figma design system → specs → drift report (read-only POC)

Usage: npm run ds-sync -- <command> [options]

Commands:
  extract   Read Figma (REST) into out/figma-ir.json        (needs FIGMA_TOKEN)
  spec      Build out/specs/*.spec.yaml from the IR
  analyze   Read the code repo into out/code-ir.json
  report    Diff specs against code → out/report.html + report.json
  run       All of the above, in order
  generate  Build a fresh Storybook project from the IR (config "generate")

Options:
  --config <file>   Config file (default: ds-sync.config.json)
  --out <dir>       Output directory (default: out)
  --refresh         Ignore the Figma response cache
  --help            Show this help
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', default: 'ds-sync.config.json' },
      out: { type: 'string', default: 'out' },
      refresh: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return;
  }
  const config = loadConfig(values.config!);
  loadDotEnv(join(config.baseDir, '.env'));
  const p = paths(config, values.out);
  const log = (m: string) => process.stderr.write(`· ${m}\n`);

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
    case 'generate': {
      if (!config.generate) throw new Error('No "generate" section in the config.');
      const token = process.env.FIGMA_TOKEN;
      if (!token) throw new Error('FIGMA_TOKEN is not set (needed to export icons).');
      const ir = values.refresh ? await stepExtract(config, p, { refresh: true, log }) : loadIR(p);
      const client = new FigmaClient({ token, cacheDir: p.cache, log });
      const res = await generateStorybook(config, config.generate, ir, client, log);
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
  process.stderr.write(`ds-sync: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
