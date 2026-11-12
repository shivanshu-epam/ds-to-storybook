import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { stringify as toYaml } from 'yaml';

import { analyzeComponent, definedVars, type CodeIR } from './code/analyze.ts';
import type { LoadedConfig } from './config.ts';
import { diffComponent, type ComponentDrift } from './diff/diff.ts';
import { FigmaClient } from './figma/client.ts';
import { extractIR } from './ir/extract.ts';
import type { FigmaIR } from './ir/types.ts';
import { renderReport } from './report/html.ts';
import { buildSpec, loadArchetype } from './spec/build.ts';
import type { ComponentSpec } from './spec/types.ts';
import { readJson, writeJson, writeText } from './util/core.ts';

export interface Paths {
  out: string;
  ir: string;
  specs: string;
  codeIr: string;
  reportHtml: string;
  reportJson: string;
  cache: string;
  archetypes: string;
}

export function paths(config: LoadedConfig, outDir = 'out'): Paths {
  const out = resolve(config.baseDir, outDir);
  return {
    out,
    ir: join(out, 'figma-ir.json'),
    specs: join(out, 'specs'),
    codeIr: join(out, 'code-ir.json'),
    reportHtml: join(out, 'report.html'),
    reportJson: join(out, 'report.json'),
    cache: join(config.baseDir, '.cache', 'figma'),
    archetypes: join(config.baseDir, 'archetypes'),
  };
}

export async function stepExtract(config: LoadedConfig, p: Paths, opts: { refresh?: boolean; log: (m: string) => void }): Promise<FigmaIR> {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error('FIGMA_TOKEN is not set. Copy .env.example to .env and add a Figma personal access token.');
  const client = new FigmaClient({ token, cacheDir: p.cache, log: opts.log, ...(config.figma.apiBase ? { apiBase: config.figma.apiBase } : {}), ...(opts.refresh ? { refresh: true } : {}) });
  const ir = await extractIR(client, config, opts.log);
  writeJson(p.ir, ir);
  return ir;
}

export function stepSpecs(config: LoadedConfig, p: Paths, ir: FigmaIR): ComponentSpec[] {
  const specs: ComponentSpec[] = [];
  for (const set of ir.components) {
    const target = config.components.find((c) => c.id === set.targetId);
    if (!target) continue;
    const spec = buildSpec(set, ir, target, loadArchetype(p.archetypes, target.archetype));
    // The docs text is kept in the IR; the spec file stays reviewable.
    const { text: _text, ...docs } = spec.docs;
    writeText(join(p.specs, `${spec.id}.spec.yaml`), toYaml({ ...spec, docs }, { lineWidth: 0 }));
    specs.push(spec);
  }
  return specs;
}

export function stepAnalyze(config: LoadedConfig, p: Paths): CodeIR {
  const tokenCss = (config.repo.tokenCss ?? []).map((f) => join(config.repoDir, f));
  const codeIR: CodeIR = {
    repoDir: config.repoDir,
    tokenVars: definedVars(tokenCss),
    components: config.components.map((t) => analyzeComponent(config.repoDir, t)),
  };
  writeJson(p.codeIr, codeIR);
  return codeIR;
}

export function stepReport(config: LoadedConfig, p: Paths, ir: FigmaIR, specs: ComponentSpec[], codeIR: CodeIR, generatedAt = new Date().toISOString()): ComponentDrift[] {
  const drifts = specs.map((spec) => {
    const code = codeIR.components.find((c) => c.targetId === spec.id);
    if (!code) throw new Error(`No code analysis for ${spec.id}`);
    return diffComponent(spec, code, codeIR);
  });
  writeJson(p.reportJson, { generatedAt, figma: { fileKey: ir.fileKey, version: ir.version }, missing: ir.missing, components: drifts });
  writeText(p.reportHtml, renderReport({ ir, drifts, generatedAt, repoLabel: config.repo.path }));
  return drifts;
}

export function loadIR(p: Paths): FigmaIR {
  if (!existsSync(p.ir)) throw new Error(`${p.ir} not found. Run "extract" first.`);
  return readJson<FigmaIR>(p.ir);
}
