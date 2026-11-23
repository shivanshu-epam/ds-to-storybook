// Foundations pages: the design system's colours, typography, spacing, radii, elevation and motion, from Figma
// variables (as CSS custom properties, so modes switch) or, without variables, from the file's local styles.
// The model is framework-neutral; each page is plain HTML that the React and Web Components projects both render.
import type { FigmaNode } from '../figma/types.ts';
import type { FigmaIR } from '../ir/types.ts';
import { fontStack, resolveDefault, type TokenRow, type TokenSet } from './tokens.ts';

export interface Swatch {
  name: string;
  group: string;
  /** CSS value: var(--token) when it comes from a variable, else a literal. */
  css: string;
  /** Resolved value in the default mode, for the label. */
  value: string;
  cssVar?: string;
  description?: string;
}

export interface TypeStyle {
  name: string;
  group: string;
  family: string;
  size: string;
  weight: string;
  lineHeight?: string;
  letterSpacing?: string;
  /** Resolved values for the label. */
  label: string;
}

export interface Foundations {
  /** Where each section comes from. */
  sources: { colors?: 'variables' | 'styles'; typography?: 'variables' | 'styles'; effects?: 'styles' };
  colors: Swatch[];
  typography: TypeStyle[];
  spacing: Swatch[];
  radius: Swatch[];
  sizing: Swatch[];
  borders: Swatch[];
  shadows: Swatch[];
  motion: Swatch[];
  opacity: Swatch[];
}

const SPACING = /(^|[/-])(space|spacing|gap|padding|margin|inset|gutter|stack|inline)([/-]|$)/i;
const RADIUS = /radius|corner|rounded?([/-]|$)/i;
const BORDER = /(border|stroke).*(width|weight)|(^|[/-])(border|stroke)([/-]|$)/i;
const SIZING = /(^|[/-])(size|sizes|width|height|dimension|icon)([/-]|$)/i;
const TYPE = /(^|[/-])(font|type|typography|text-?style|line-?height|letter-?spacing|leading|tracking)([/-]|$)/i;
const MOTION = /duration|speed|delay|easing|ease|curve|motion/i;
const OPACITY = /opacity|alpha/i;

const parent = (name: string) => name.split('/').slice(0, -1).join('/');
const leaf = (name: string) => name.split('/').at(-1) ?? name;
const group = (name: string) => name.split('/').slice(0, -1).join(' / ') || 'Tokens';
/** Primitives are the raw palette; everything else is what components use. */
const isPrimitive = (r: TokenRow) => /^primitives?\b|core|base|global/i.test(r.collection);

const rgba = (c: { r: number; g: number; b: number; a?: number }, opacity = 1) => {
  const a = Math.round((c.a ?? 1) * opacity * 1000) / 1000;
  const hex = [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  return a >= 1 ? `#${hex}` : `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
};

function swatch(set: TokenSet, r: TokenRow): Swatch {
  return { name: r.name, group: `${isPrimitive(r) ? 'Palette' : r.collection.replace(/[._-]?colou?r$/i, '') || 'Colours'} · ${group(r.name)}`, css: `var(${r.cssVar})`, value: resolveDefault(set, r) ?? '', cssVar: r.cssVar };
}

/** Typography from variables: sibling tokens under one parent that name a family and a size (text-style/body/md/…). */
function typeFromTokens(set: TokenSet): TypeStyle[] {
  const byParent = new Map<string, TokenRow[]>();
  for (const r of set.rows) if (TYPE.test(r.name) || /family|weight/.test(leaf(r.name))) byParent.set(parent(r.name), [...(byParent.get(parent(r.name)) ?? []), r]);
  const out: TypeStyle[] = [];
  for (const [p, rows] of byParent) {
    const pick = (re: RegExp) => rows.find((r) => re.test(leaf(r.name)));
    const family = pick(/family|font$/i);
    const size = pick(/^(font-?)?size$/i);
    if (!family || !size) continue;
    const weight = pick(/weight/i);
    const lh = pick(/line-?height|leading/i);
    const ls = pick(/letter|tracking/i);
    const v = (r?: TokenRow) => (r ? resolveDefault(set, r) : undefined);
    out.push({
      name: p, group: group(p), family: `var(${family.cssVar})`, size: `var(${size.cssVar})`, weight: weight ? `var(${weight.cssVar})` : '400',
      ...(lh ? { lineHeight: `var(${lh.cssVar})` } : {}), ...(ls ? { letterSpacing: `var(${ls.cssVar})` } : {}),
      label: [v(family)?.split(',')[0]?.replace(/"/g, ''), v(size), v(weight), lh ? `/ ${v(lh)}` : ''].filter(Boolean).join(' '),
    });
  }
  return out;
}

export function fromTokens(set: TokenSet): Foundations {
  const f = empty();
  const rows = set.rows;
  const colors = rows.filter((r) => r.type === 'C');
  // Semantic tokens first: they are what components use; the palette follows.
  f.colors = [...colors.filter((r) => !isPrimitive(r)), ...colors.filter(isPrimitive)].map((r) => swatch(set, r));
  if (f.colors.length) f.sources.colors = 'variables';
  f.typography = typeFromTokens(set);
  if (f.typography.length) f.sources.typography = 'variables';
  const typeRows = new Set(f.typography.length ? rows.filter((r) => TYPE.test(r.name) || /family|weight/.test(leaf(r.name))) : []);
  for (const r of rows.filter((x) => x.type === 'F' && !typeRows.has(x))) {
    const s = { name: r.name, group: group(r.name), css: `var(${r.cssVar})`, value: resolveDefault(set, r) ?? '', cssVar: r.cssVar };
    if (MOTION.test(r.name)) f.motion.push(s);
    else if (OPACITY.test(r.name)) f.opacity.push(s);
    else if (RADIUS.test(r.name)) f.radius.push(s);
    else if (BORDER.test(r.name)) f.borders.push(s);
    else if (SPACING.test(r.name)) f.spacing.push(s);
    else if (SIZING.test(r.name)) f.sizing.push(s);
  }
  for (const r of rows.filter((x) => x.type === 'S' && MOTION.test(x.name))) f.motion.push({ name: r.name, group: group(r.name), css: `var(${r.cssVar})`, value: resolveDefault(set, r) ?? '', cssVar: r.cssVar });
  return f;
}

/** Style definitions by style node id (the nodes Figma returns for them). */
export type StyleNodes = Record<string, FigmaNode | undefined>;

function shadowCss(effects: FigmaNode['effects']): string | undefined {
  const parts = (effects ?? []).filter((e) => e.visible !== false && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.color).map((e) =>
    `${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${Math.round(e.offset?.x ?? 0)}px ${Math.round(e.offset?.y ?? 0)}px ${Math.round(e.radius ?? 0)}px ${Math.round(e.spread ?? 0)}px ${rgba(e.color!)}`);
  return parts.length ? parts.join(', ') : undefined;
}

/** Adds what the file's local styles define and the variables do not: colours and typography without variables,
 * and elevation (Figma variables cannot hold shadows). */
export function addStyles(f: Foundations, styles: NonNullable<FigmaIR['styles']>, nodes: StyleNodes): Foundations {
  for (const st of styles) {
    const n = nodes[st.id];
    if (!n) continue;
    const description = st.description && !/^[•\s#0-9a-f.\n-]+$/i.test(st.description) ? st.description.split('\n')[0] : undefined;
    if (st.type === 'FILL' && f.sources.colors !== 'variables') {
      const paint = (n.fills ?? []).find((p) => p.visible !== false && p.type === 'SOLID' && p.color);
      if (!paint) continue;
      const value = rgba(paint.color!, paint.opacity ?? 1);
      f.colors.push({ name: st.name, group: group(st.name), css: value, value, ...(description ? { description } : {}) });
      f.sources.colors = 'styles';
    } else if (st.type === 'TEXT' && f.sources.typography !== 'variables' && n.style) {
      const s = n.style;
      if (!s.fontFamily || !s.fontSize) continue;
      const lh = s.lineHeightPx ? `${Math.round(s.lineHeightPx * 100) / 100}px` : undefined;
      const ls = s.letterSpacing ? `${Math.round(s.letterSpacing * 100) / 100}px` : undefined;
      f.typography.push({
        name: st.name, group: group(st.name), family: fontStack(s.fontFamily), size: `${s.fontSize}px`, weight: String(s.fontWeight ?? 400),
        ...(lh ? { lineHeight: lh } : {}), ...(ls ? { letterSpacing: ls } : {}),
        label: `${s.fontFamily} ${s.fontSize}px ${s.fontWeight ?? 400}${lh ? ` / ${lh}` : ''}${ls ? `, ${ls}` : ''}`,
      });
      f.sources.typography = 'styles';
    } else if (st.type === 'EFFECT') {
      const css = shadowCss(n.effects);
      if (!css) continue;
      f.shadows.push({ name: st.name, group: group(st.name), css, value: css, ...(description ? { description } : {}) });
      f.sources.effects = 'styles';
    }
  }
  return f;
}

function empty(): Foundations {
  return { sources: {}, colors: [], typography: [], spacing: [], radius: [], sizing: [], borders: [], shadows: [], motion: [], opacity: [] };
}

// ---------------------------------------------------------------------------------------------
// Pages: plain HTML on a light card, so the labels stay readable in every mode and pass axe.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A CSS value inside style="…": double quotes in font stacks become single quotes. */
const attr = (s: string) => esc(s.replace(/"/g, "'"));
const CARD = "font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2937;background:#ffffff;padding:16px;border-radius:8px";
const MUTED = 'color:#4b5563';

function groups<T extends { group: string }>(items: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of items) m.set(x.group, [...(m.get(x.group) ?? []), x]);
  // Figma's private convention (a leading "_" or ".") and deprecated styles go last: public styles open the page.
  const internal = (g: string) => /(^|[/·] )[_.]|^[_.]|deprecated/i.test(g);
  return [...m].sort(([a], [b]) => Number(internal(a)) - Number(internal(b)));
}

const section = (title: string, body: string) => `<section style="margin:0 0 24px"><h2 style="font-size:14px;margin:0 0 8px">${esc(title)}</h2>${body}</section>`;
const code = (s?: string) => (s ? `<code style="font-size:12px">${esc(s)}</code>` : '');

function colorsHtml(items: Swatch[]): string {
  return groups(items).map(([g, xs]) => section(g, `<ul style="list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">${xs.map((x) =>
    `<li style="display:flex;align-items:center;gap:8px"><span aria-hidden="true" style="width:32px;height:32px;flex:none;border-radius:6px;background:${attr(x.css)};box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)"></span><span><strong>${esc(leaf(x.name))}</strong><br />${code(x.cssVar ?? x.value)}${x.cssVar ? ` <span style="${MUTED}">${esc(x.value)}</span>` : ''}${x.description ? `<br /><span style="${MUTED}">${esc(x.description)}</span>` : ''}</span></li>`).join('')}</ul>`)).join('');
}

function typographyHtml(items: TypeStyle[]): string {
  return groups(items).map(([g, xs]) => section(g, `<table style="border-collapse:collapse;width:100%"><thead><tr><th scope="col" style="text-align:left;padding:4px 8px">Style</th><th scope="col" style="text-align:left;padding:4px 8px">Sample</th></tr></thead><tbody>${xs.map((x) =>
    `<tr style="border-top:1px solid #e5e7eb"><td style="padding:8px;vertical-align:top;width:220px"><strong>${esc(leaf(x.name))}</strong><br /><span style="${MUTED}">${esc(x.label)}</span></td><td style="padding:8px"><span style="display:block;font-family:${attr(x.family)};font-size:${attr(x.size)};font-weight:${attr(x.weight)}${x.lineHeight ? `;line-height:${attr(x.lineHeight)}` : ''}${x.letterSpacing ? `;letter-spacing:${attr(x.letterSpacing)}` : ''};color:#111827">The quick brown fox jumps over the lazy dog</span></td></tr>`).join('')}</tbody></table>`)).join('');
}

function scaleHtml(items: Swatch[], kind: 'spacing' | 'radius' | 'sizing' | 'borders'): string {
  const sample = (x: Swatch) => kind === 'radius'
    ? `<span aria-hidden="true" style="display:block;width:48px;height:48px;background:#e0e7ff;border:1px solid #6366f1;border-radius:${attr(x.css)}"></span>`
    : kind === 'borders'
      ? `<span aria-hidden="true" style="display:block;width:96px;height:0;border-top:${attr(x.css)} solid #4f46e5"></span>`
      : `<span aria-hidden="true" style="display:block;height:12px;width:${attr(x.css)};max-width:100%;background:#6366f1;border-radius:2px"></span>`;
  return groups(items).map(([g, xs]) => section(g, `<table style="border-collapse:collapse;width:100%"><thead><tr><th scope="col" style="text-align:left;padding:4px 8px">Token</th><th scope="col" style="text-align:left;padding:4px 8px">Value</th><th scope="col" style="text-align:left;padding:4px 8px">Sample</th></tr></thead><tbody>${xs.map((x) =>
    `<tr style="border-top:1px solid #e5e7eb"><td style="padding:6px 8px"><strong>${esc(leaf(x.name))}</strong> ${code(x.cssVar)}</td><td style="padding:6px 8px">${esc(x.value)}</td><td style="padding:6px 8px;width:50%">${sample(x)}</td></tr>`).join('')}</tbody></table>`)).join('');
}

function shadowsHtml(items: Swatch[]): string {
  return `<ul style="list-style:none;margin:0;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:32px">${items.map((x) =>
    `<li style="display:flex;flex-direction:column;gap:8px"><span aria-hidden="true" style="display:block;height:80px;border-radius:8px;background:#ffffff;box-shadow:${attr(x.css)}"></span><span><strong>${esc(x.name)}</strong><br /><span style="${MUTED}">${esc(x.value)}</span></span></li>`).join('')}</ul>`;
}

function listHtml(items: Swatch[]): string {
  return groups(items).map(([g, xs]) => section(g, `<table style="border-collapse:collapse;width:100%"><thead><tr><th scope="col" style="text-align:left;padding:4px 8px">Token</th><th scope="col" style="text-align:left;padding:4px 8px">Value</th></tr></thead><tbody>${xs.map((x) =>
    `<tr style="border-top:1px solid #e5e7eb"><td style="padding:6px 8px"><strong>${esc(leaf(x.name))}</strong> ${code(x.cssVar)}</td><td style="padding:6px 8px">${esc(x.value)}</td></tr>`).join('')}</tbody></table>`)).join('');
}

export interface FoundationPage {
  /** File and story-title name: Foundations/<title>. */
  title: string;
  /** One sentence on what the page shows and where it comes from. */
  intro: string;
  html: string;
}

/** Pages with content only; an empty section gets no page. */
export function foundationPages(f: Foundations): FoundationPage[] {
  const from = (s?: string) => (s === 'variables' ? 'Figma variables (switch modes in the toolbar)' : 'the Figma file’s local styles');
  const wrap = (intro: string, body: string) => `<div style="${CARD}"><p style="margin:0 0 16px;${MUTED}">${esc(intro)}</p>${body}</div>`;
  const pages: FoundationPage[] = [];
  const add = (title: string, intro: string, body: string) => pages.push({ title, intro, html: wrap(intro, body) });
  if (f.colors.length) add('Colors', `${f.colors.length} colours from ${from(f.sources.colors)}.`, colorsHtml(f.colors));
  if (f.typography.length) add('Typography', `${f.typography.length} text styles from ${from(f.sources.typography)}.`, typographyHtml(f.typography));
  if (f.spacing.length) add('Spacing', `${f.spacing.length} spacing tokens from Figma variables.`, scaleHtml(f.spacing, 'spacing'));
  if (f.radius.length) add('Radius', `${f.radius.length} corner radius tokens from Figma variables.`, scaleHtml(f.radius, 'radius'));
  if (f.sizing.length) add('Sizing', `${f.sizing.length} size tokens from Figma variables.`, scaleHtml(f.sizing, 'sizing'));
  if (f.borders.length) add('Borders', `${f.borders.length} border width tokens from Figma variables.`, scaleHtml(f.borders, 'borders'));
  if (f.shadows.length) add('Elevation', `${f.shadows.length} shadows from the Figma file’s effect styles.`, shadowsHtml(f.shadows));
  if (f.motion.length) add('Motion', `${f.motion.length} motion tokens from Figma variables.`, listHtml(f.motion));
  if (f.opacity.length) add('Opacity', `${f.opacity.length} opacity tokens from Figma variables.`, listHtml(f.opacity));
  return pages;
}
