// Fonts the Figma file uses: load each one from an npm package (Fontsource, open-source Google Fonts and others),
// keep system fonts as system stacks, and report every family that cannot be loaded. Never silent.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { FigmaIR } from '../ir/types.ts';

export interface FontPlan {
  /** Family name as Figma uses it. */
  family: string;
  /** Text layers that use it. */
  layers: number;
  /** Weights used in Figma. */
  weights: number[];
  status: 'package' | 'substitute' | 'system' | 'missing' | 'configured';
  /** npm package that provides it. */
  package?: string;
  version?: string;
  /** CSS imports, relative to the package (e.g. "@fontsource/lato/400.css"). */
  imports?: string[];
  /** font-family value for CSS. */
  stack: string;
  note?: string;
}

/** Font metadata (Fontsource API) and npm versions, cached on disk so generation is repeatable and works offline. */
export interface FontSource {
  meta(id: string): Promise<{ family: string; weights: number[]; variable: boolean; category?: string } | undefined>;
  version(pkg: string): Promise<string | undefined>;
}

export type FontOverride = { package: string; family?: string; imports?: string[]; version?: string } | false;

const SYSTEM: [RegExp, string][] = [
  [/^(SF Pro|SF Compact|New York)/i, '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'],
  [/^(SF Mono|Menlo|Monaco)$/i, 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'],
  [/^(Helvetica|Helvetica Neue|Arial)$/i, 'Helvetica, Arial, sans-serif'],
  [/^(Times|Times New Roman|Georgia)$/i, 'Georgia, "Times New Roman", serif'],
  [/^(Courier|Courier New)$/i, '"Courier New", Courier, monospace'],
  [/^(Segoe UI|system-ui)$/i, 'system-ui, "Segoe UI", sans-serif'],
];
/** Optical-size or role suffixes some families carry in Figma but not in their published name ("TASA Orbiter Display"). */
const SUFFIX = /\s+(Display|Text|Deck|Caption|Micro|Banner|Headline|Title)$/;
const quote = (f: string) => `"${f}"`;
const slug = (f: string) => f.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fallback = (category?: string, family = '') =>
  category === 'monospace' || /mono|code/i.test(family) ? 'ui-monospace, monospace' : category === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif';

/** Families used by text layers (and string typography tokens), with how many layers use each and their weights. */
export function usedFonts(ir: FigmaIR): Map<string, { layers: number; weights: Set<number> }> {
  const out = new Map<string, { layers: number; weights: Set<number> }>();
  const add = (family: string | undefined, weight?: number) => {
    if (!family) return;
    const e = out.get(family) ?? { layers: 0, weights: new Set<number>() };
    e.layers++;
    if (weight) e.weights.add(weight);
    out.set(family, e);
  };
  for (const s of ir.components) for (const v of s.variants) {
    add(v.style.text?.fontFamily, v.style.text?.fontWeight);
    for (const p of v.parts) add(p.style.text?.fontFamily, p.style.text?.fontWeight);
  }
  return out;
}

export async function planFonts(used: Map<string, { layers: number; weights: Set<number> }>, source: FontSource | undefined, overrides: Record<string, FontOverride> = {}): Promise<FontPlan[]> {
  const plans: FontPlan[] = [];
  for (const [family, u] of [...used].sort((a, b) => b[1].layers - a[1].layers)) {
    const weights = [...u.weights].sort((a, b) => a - b);
    const base = { family, layers: u.layers, weights };
    const over = overrides[family];
    if (over === false) {
      plans.push({ ...base, status: 'missing', stack: `${quote(family)}, system-ui, sans-serif`, note: 'Not loaded (configuration: fonts set to false).' });
      continue;
    }
    if (over) {
      plans.push({ ...base, status: 'configured', package: over.package, ...(over.version ? { version: over.version } : {}), imports: over.imports ?? [over.package], stack: `${quote(family)}${over.family && over.family !== family ? `, ${quote(over.family)}` : ''}, system-ui, sans-serif`, note: 'From the fonts configuration.' });
      continue;
    }
    const system = SYSTEM.find(([re]) => re.test(family));
    if (system) {
      plans.push({ ...base, status: 'system', stack: `${quote(family)}, ${system[1]}`, note: 'System font, not distributable: renders as designed only where it is installed (Apple devices for SF and Menlo); elsewhere the fallback stack is used.' });
      continue;
    }
    const found = source ? await resolveFont(family, source) : undefined;
    if (!found) {
      plans.push({ ...base, status: 'missing', stack: `${quote(family)}, system-ui, sans-serif`, note: source ? 'No open-source package found. Add it under "fonts" in the configuration (your own font package), or install the font locally.' : 'Not looked up (offline).' });
      continue;
    }
    const { id, meta, published } = found;
    const pkg = meta.variable ? `@fontsource-variable/${id}` : `@fontsource/${id}`;
    const version = await source!.version(pkg);
    if (!version) {
      plans.push({ ...base, status: 'missing', stack: `${quote(family)}, system-ui, sans-serif`, note: `Font "${meta.family}" exists, but the npm package ${pkg} could not be read.` });
      continue;
    }
    const want = weights.length ? weights : [400];
    const missingWeights = meta.variable ? [] : want.filter((w) => !meta.weights.includes(w));
    const imports = meta.variable ? [pkg] : [...new Set(want.filter((w) => meta.weights.includes(w)))].map((w) => `${pkg}/${w}.css`);
    const cssFamily = meta.variable ? `${meta.family} Variable` : meta.family;
    plans.push({
      ...base,
      status: published === family ? 'package' : 'substitute',
      package: pkg,
      version,
      imports: imports.length ? imports : [pkg],
      stack: `${quote(family)}, ${quote(cssFamily)}${published === family ? '' : `, ${quote(meta.family)}`}, ${fallback(meta.category, family)}`,
      ...(published !== family ? { note: `Figma uses "${family}"; loaded as "${meta.family}", the published family without the "${family.slice(meta.family.length).trim()}" suffix. Confirm with the design system owner.` } : missingWeights.length ? { note: `Weights not in the package: ${missingWeights.join(', ')} (the browser synthesises them).` } : {}),
    });
  }
  return plans;
}

async function resolveFont(family: string, source: FontSource) {
  for (const name of [family, family.replace(SUFFIX, '')].filter((n, i, a) => a.indexOf(n) === i)) {
    const meta = await source.meta(slug(name));
    if (meta) return { id: slug(name), meta, published: name };
  }
  return undefined;
}

/** Fontsource API + npm registry, cached in one JSON file. */
export function httpFontSource(cacheFile: string, fetcher: typeof fetch = fetch): FontSource {
  type Cache = { meta: Record<string, unknown>; version: Record<string, string | null> };
  let cache: Cache = { meta: {}, version: {} };
  try { if (existsSync(cacheFile)) cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as Cache; } catch { /* start over */ }
  const save = () => { mkdirSync(dirname(cacheFile), { recursive: true }); writeFileSync(cacheFile, JSON.stringify(cache, null, 2)); };
  const get = async (url: string) => {
    try {
      const r = await fetcher(url, { headers: { accept: 'application/json', 'user-agent': 'ds-sync' } });
      return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
    } catch {
      return undefined; // offline: not cached, so it is tried again next time
    }
  };
  return {
    async meta(id) {
      if (!(id in cache.meta)) {
        const d = await get(`https://api.fontsource.org/v1/fonts/${id}`);
        if (d === undefined) return undefined;
        cache.meta[id] = d ? { family: d.family, weights: d.weights, variable: Boolean(d.variable), category: d.category } : null;
        save();
      }
      return (cache.meta[id] ?? undefined) as Awaited<ReturnType<FontSource['meta']>>;
    },
    async version(pkg) {
      if (!(pkg in cache.version)) {
        const d = await get(`https://registry.npmjs.org/${pkg.replace('/', '%2F')}`);
        if (d === undefined) return undefined;
        cache.version[pkg] = ((d?.['dist-tags'] as Record<string, string> | undefined)?.latest) ?? null;
        save();
      }
      return cache.version[pkg] ?? undefined;
    },
  };
}

/** Markdown section for GENERATION-REPORT.md. */
export function fontsReport(plans: FontPlan[]): string[] {
  if (!plans.length) return [];
  const how = (p: FontPlan) => (p.status === 'package' ? `\`${p.package}\` ${p.version}` : p.status === 'substitute' ? `substitute: \`${p.package}\` ${p.version}` : p.status === 'configured' ? `configured: \`${p.package}\`` : p.status === 'system' ? 'system font' : '**not loaded**');
  return [
    '## Fonts',
    '',
    '| Figma family | Text layers | Weights | Loaded as | Note |',
    '| --- | --- | --- | --- | --- |',
    ...plans.map((p) => `| ${p.family} | ${p.layers} | ${p.weights.join(', ') || '—'} | ${how(p)} | ${p.note ?? ''} |`),
    '',
  ];
}
