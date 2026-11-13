/**
 * Design tokens: Figma variables (export format) -> CSS custom properties, plus a
 * resolver that maps a raw Figma value back to the best-matching token.
 *
 * Export format (tokens/figma-variables.json): variables[collection] = [[name, type, value | {mode: value}, codeSyntax]]
 * type: C colour, F float, S string. A value "@collection:name" is an alias.
 */

import type { LocalVariablesResponse } from '../figma/types.ts';

/**
 * The Variables REST API response (Enterprise) converted to the export format,
 * so both sources feed the same token pipeline.
 */
export function exportFromRest(res: LocalVariablesResponse): { variables: Record<string, unknown[]> } {
  const { variables, variableCollections } = res.meta;
  const out: Record<string, unknown[]> = {};
  const hex = (c: { r: number; g: number; b: number; a?: number }) => {
    const ch = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}${c.a !== undefined && c.a < 1 ? ch(c.a) : ''}`;
  };
  for (const v of Object.values(variables)) {
    const col = variableCollections[v.variableCollectionId];
    if (!col) continue;
    const type = v.resolvedType === 'COLOR' ? 'C' : v.resolvedType === 'FLOAT' ? 'F' : v.resolvedType === 'STRING' ? 'S' : undefined;
    if (!type) continue;
    const convert = (raw: unknown): unknown => {
      if (raw && typeof raw === 'object' && (raw as { type?: string }).type === 'VARIABLE_ALIAS') {
        const target = variables[(raw as { id: string }).id];
        const tc = target ? variableCollections[target.variableCollectionId] : undefined;
        return target && tc ? `@${tc.name}:${target.name}` : null;
      }
      if (raw && typeof raw === 'object' && 'r' in (raw as object)) return hex(raw as { r: number; g: number; b: number; a?: number });
      return raw;
    };
    const modes = col.modes;
    const value = modes.length > 1
      ? Object.fromEntries(modes.map((m) => [m.name, convert(v.valuesByMode[m.modeId])]))
      : convert(v.valuesByMode[modes[0]?.modeId ?? '']);
    (out[col.name] ??= []).push([v.name, type, value, v.codeSyntax?.WEB ?? '']);
  }
  return { variables: out };
}

export interface TokenRow {
  collection: string;
  name: string;
  type: 'C' | 'F' | 'S';
  value: unknown;
  cssVar: string;
}

export interface TokenSet {
  rows: TokenRow[];
  byKey: Map<string, TokenRow>;
  /** Collection -> its modes (first = default). Empty for single-mode collections. */
  modes: Record<string, string[]>;
}

const SKIP = [/^typography\/weight-name\//];

const FONT_STACKS: Record<string, string> = {
  Inter: '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  'JetBrains Mono': '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Stacks for the fonts this generation loads (see fonts.ts); set before templates run. */
let loaded: Record<string, string> = {};
export function setFontStacks(stacks: Record<string, string>): void {
  loaded = stacks;
}

export function fontStack(family: string): string {
  return FONT_STACKS[family] ?? loaded[family] ?? `"${family}", system-ui, sans-serif`;
}

const cssName = (name: string, codeSyntax: unknown) =>
  (typeof codeSyntax === 'string' ? /var\((--[\w-]+)\)/.exec(codeSyntax)?.[1] : undefined) ?? `--${name.replace(/\//g, '-')}`;

function unitFor(name: string): string {
  if (/letter-spacing/.test(name)) return 'em';
  if (/^motion\/(duration|speed)\//.test(name)) return 'ms';
  if (/^typography\/(weight|line-height)\//.test(name)) return '';
  if (/^(opacity|z-index)\//.test(name)) return '';
  return 'px';
}

const isAlias = (v: unknown): v is string => typeof v === 'string' && v.startsWith('@');
const isModed = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
const round = (n: number) => Math.round(n * 10000) / 10000;

export function loadTokens(json: { variables?: Record<string, unknown[]> }): TokenSet {
  const rows: TokenRow[] = [];
  const modes: Record<string, string[]> = {};
  for (const [collection, list] of Object.entries(json.variables ?? {})) {
    for (const r of list) {
      if (!Array.isArray(r) || typeof r[0] !== 'string' || SKIP.some((re) => re.test(r[0] as string))) continue;
      const row: TokenRow = { collection, name: r[0], type: r[1] as TokenRow['type'], value: r[2], cssVar: cssName(r[0], r[3]) };
      rows.push(row);
      if (isModed(row.value) && !modes[collection]) modes[collection] = Object.keys(row.value);
    }
  }
  // Two variables with one CSS name would overwrite (or reference) each other in tokens.css.
  // The semantic layer keeps the public name, then primitives; the others get a collection prefix.
  const rank = (c: string) => (/^semantic\b/i.test(c) ? 0 : /^primitives?\b/i.test(c) ? 1 : 2);
  const groups = new Map<string, TokenRow[]>();
  for (const row of rows) groups.set(row.cssVar, [...(groups.get(row.cssVar) ?? []), row]);
  const taken = new Set(groups.keys());
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const owner = [...group].sort((a, b) => rank(a.collection) - rank(b.collection))[0]!;
    for (const row of group) {
      if (row === owner) continue;
      let name = `--${row.collection.replace(/[^A-Za-z0-9]+/g, '-')}-${row.name.replace(/[^A-Za-z0-9]+/g, '-')}`;
      for (let i = 2; taken.has(name); i++) name = `${name}-${i}`;
      taken.add(name);
      row.cssVar = name;
    }
  }
  return { rows, byKey: new Map(rows.map((r) => [`${r.collection}:${r.name}`, r])), modes };
}

function literal(row: TokenRow, raw: unknown): string {
  if (row.type === 'C') return String(raw);
  if (row.type === 'S') return fontStack(String(raw));
  const n = Number(raw);
  const unit = unitFor(row.name);
  return n === 0 || unit === '' ? String(round(n)) : `${round(n)}${unit}`;
}

function cssValue(set: TokenSet, row: TokenRow, raw: unknown): string {
  if (!isAlias(raw)) return literal(row, raw);
  const target = set.byKey.get(raw.slice(1));
  if (!target) throw new Error(`Unresolved alias ${raw} on ${row.collection}:${row.name}`);
  return `var(${target.cssVar})`;
}

/** Resolved literal value in the default mode of every collection, following aliases. */
export function resolveDefault(set: TokenSet, row: TokenRow, depth = 0): string | undefined {
  if (depth > 10) return undefined;
  const raw = isModed(row.value) ? Object.values(row.value)[0] : row.value;
  if (isAlias(raw)) {
    const target = set.byKey.get(raw.slice(1));
    return target ? resolveDefault(set, target, depth + 1) : undefined;
  }
  return literal(row, raw);
}

/**
 * CSS for all tokens. The first mode of each collection goes in :root; every
 * other mode becomes an attribute block, e.g. [data-theme="dark"].
 */
export function tokensCss(set: TokenSet, modeAttributes: Record<string, string>): string {
  const lines = ['/* Generated from Figma variables by ds-sync. Do not edit by hand. */', ':root {'];
  for (const row of set.rows) {
    const raw = isModed(row.value) ? Object.values(row.value)[0] : row.value;
    lines.push(`  ${row.cssVar}: ${cssValue(set, row, raw)};`);
  }
  lines.push('}');
  for (const [collection, modes] of Object.entries(set.modes)) {
    const attr = modeAttributes[collection] ?? `data-${collection.replace(/\W+/g, '-')}`;
    for (const mode of modes.slice(1)) {
      lines.push('', `[${attr}="${mode}"] {`);
      for (const row of set.rows.filter((r) => r.collection === collection && isModed(r.value))) {
        lines.push(`  ${row.cssVar}: ${cssValue(set, row, (row.value as Record<string, unknown>)[mode])};`);
      }
      lines.push('}');
    }
  }
  return lines.join('\n') + '\n';
}

export interface TokenDecision {
  value: string;
  hint: string[];
  variableId: string | null;
  token?: string;
  reason: 'bound' | 'raw-in-figma' | 'no-matching-token';
}

/**
 * Maps a Figma value to a token. Figma's variable ids cannot be resolved to names
 * without the Enterprise Variables API, so a bound value is matched by its
 * resolved value, scored by collection (semantic wins) and name hints, and the
 * choice is kept per variable id so one Figma variable always maps to one token.
 * Values that are raw in Figma stay raw.
 */
export class TokenResolver {
  private readonly byValue = new Map<string, TokenRow[]>();
  private readonly chosen = new Map<string, TokenRow | null>();
  readonly decisions: TokenDecision[] = [];

  constructor(private readonly set: TokenSet) {
    for (const row of set.rows) {
      if (row.type === 'S') continue;
      const v = resolveDefault(set, row);
      if (v === undefined) continue;
      const key = v.toLowerCase();
      const list = this.byValue.get(key) ?? [];
      list.push(row);
      this.byValue.set(key, list);
    }
  }

  /** `var(--x)` for the first token whose name matches, semantic collections first. */
  byName(test: RegExp): string | undefined {
    const rows = this.set.rows.filter((r) => test.test(r.name));
    const row = rows.find((r) => r.collection.startsWith('semantic')) ?? rows[0];
    return row ? `var(${row.cssVar})` : undefined;
  }

  /**
   * @param strong property hints (e.g. "border", "bg"): weigh heavily
   * @param weak context words (e.g. variant names "primary", "hover"): break ties
   */
  css(value: string, variableId: string | null, strong: string[], weak: string[] = []): string {
    const hint = [...strong, ...weak];
    if (!variableId) {
      this.record({ value, hint, variableId, reason: 'raw-in-figma' });
      return value;
    }
    let row = this.chosen.get(variableId);
    if (row === undefined) {
      row = this.best(value, strong, weak);
      this.chosen.set(variableId, row);
    }
    if (!row) {
      this.record({ value, hint, variableId, reason: 'no-matching-token' });
      return value;
    }
    this.record({ value, hint, variableId, token: row.cssVar, reason: 'bound' });
    return `var(${row.cssVar})`;
  }

  private best(value: string, strong: string[], weak: string[]): TokenRow | null {
    const candidates = this.byValue.get(value.toLowerCase()) ?? [];
    if (!candidates.length) return null;
    const has = (r: TokenRow, h: string) => Boolean(h) && new RegExp(`(^|[/-])${h}([/-]|$)`, 'i').test(r.name);
    const score = (r: TokenRow) => {
      let s = r.collection.startsWith('semantic') ? 100 : 0;
      // Earlier strong hints matter more: ["inline", "inset"] prefers space/inline/*.
      strong.forEach((h, i) => { if (has(r, h)) s += 20 - i; });
      for (const h of weak) if (has(r, h)) s += 1;
      return s - r.name.length / 1000;
    };
    return [...candidates].sort((a, b) => score(b) - score(a))[0] ?? null;
  }

  private record(d: TokenDecision) {
    if (!this.decisions.some((x) => x.value === d.value && x.variableId === d.variableId && x.token === d.token)) this.decisions.push(d);
  }
}

const DTCG_TYPE = (row: TokenRow): string => {
  if (row.type === 'C') return 'color';
  if (row.type === 'S') return /family/.test(row.name) ? 'fontFamily' : 'string';
  if (/^motion\/(duration|speed)\//.test(row.name)) return 'duration';
  if (/weight/.test(row.name)) return 'fontWeight';
  if (/(opacity|z-index|line-height\/(tight|snug|normal|relaxed))/.test(row.name)) return 'number';
  return 'dimension';
};

/**
 * Design tokens in the W3C DTCG format (designtokens.org), for any platform or tool
 * (Style Dictionary, Tokens Studio, native apps). Aliases stay references; extra modes
 * live under $extensions["com.ds-sync.modes"].
 */
export function tokensDtcg(set: TokenSet): string {
  const root: Record<string, unknown> = {};
  const ref = (raw: unknown): unknown => {
    if (!isAlias(raw)) return raw;
    const [collection, name] = raw.slice(1).split(':') as [string, string];
    return `{${[...collection.split('.'), ...name.split('/')].join('.')}}`;
  };
  const value = (row: TokenRow, raw: unknown): unknown => {
    if (isAlias(raw)) return ref(raw);
    if (row.type === 'F' && DTCG_TYPE(row) === 'dimension') return `${round(Number(raw))}px`;
    if (row.type === 'F' && DTCG_TYPE(row) === 'duration') return `${round(Number(raw))}ms`;
    return raw;
  };
  for (const row of set.rows) {
    const path = [...row.collection.split('.'), ...row.name.split('/')];
    let node = root;
    for (const key of path.slice(0, -1)) {
      const next = (node[key] ??= {}) as Record<string, unknown>;
      node = next;
    }
    const raw = isModed(row.value) ? Object.values(row.value)[0] : row.value;
    const token: Record<string, unknown> = { $type: DTCG_TYPE(row), $value: value(row, raw) };
    if (isModed(row.value)) {
      token.$extensions = { 'com.ds-sync.modes': Object.fromEntries(Object.entries(row.value).map(([m, v]) => [m, value(row, v)])), 'com.ds-sync.css': row.cssVar };
    } else {
      token.$extensions = { 'com.ds-sync.css': row.cssVar };
    }
    node[path[path.length - 1]!] = token;
  }
  return JSON.stringify(root, null, 2) + '\n';
}

/** Typed TypeScript access: token name -> CSS reference and default-mode value. */
export function tokensTs(set: TokenSet): string {
  const entries = set.rows.map((r) => `  ${JSON.stringify(`${r.collection}/${r.name}`)}: { css: ${JSON.stringify(`var(${r.cssVar})`)}, value: ${JSON.stringify(resolveDefault(set, r) ?? null)} },`);
  return `// Generated by ds-sync from Figma variables. Do not edit by hand.
// Use css in styles (it follows the active theme/brand mode); value is the default-mode value.
export const tokens = {
${entries.join('\n')}
} as const;

export type TokenName = keyof typeof tokens;
`;
}
