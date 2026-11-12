import type { IRComponentSet, IRDocFrame, IRPart, IRVariant } from '../../ir/types.ts';
import type { IconAsset } from '../icons.ts';
import type { StateSelector } from '../styles.ts';
import type { TokenResolver } from '../tokens.ts';

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface ComponentReport {
  name: string;
  figmaSets: string[];
  files: string[];
  props: { prop: string; figma: string; note?: string }[];
  /** Behaviour or API decisions not specified in Figma (archetype defaults). */
  assumptions: string[];
  /** Figma items the template could not express. */
  gaps: string[];
  dependencies: Record<string, string[]>;
}

export interface TemplateContext {
  fileKey: string;
  version: string;
  sets: Record<string, IRComponentSet>;
  resolver: TokenResolver;
  icons: Map<string, IconAsset>;
}

export interface TemplateResult {
  files: GeneratedFile[];
  report: ComponentReport;
}

/** "Read-Only" -> "read-only", "Primary" -> "primary". */
export const kebab = (v: string) => v.trim().replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export const pascal = (v: string) => v.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');

/** Selector for a pseudo state that stories can also force with data-force-state. */
export function forced(state: string, native: string, target = 'root'): StateSelector {
  return { target, selector: `:is(${native}, [data-force-state~="${state}"])` };
}

export function partAt(v: IRVariant, test: RegExp | string): IRPart | undefined {
  return v.parts.find((p) => (typeof test === 'string' ? p.path === test : test.test(p.path)));
}

export function axisOptions(set: IRComponentSet, axis: string): string[] {
  return set.properties.find((p) => p.name === axis)?.options ?? [];
}

export function axisDefault(set: IRComponentSet, axis: string): string {
  return String(set.properties.find((p) => p.name === axis)?.default ?? axisOptions(set, axis)[0] ?? '');
}

/** First text found for a layer path across variants (Figma sample copy). */
export function sampleText(set: IRComponentSet, test: RegExp | string): string | undefined {
  for (const v of set.variants) {
    const t = partAt(v, test)?.text;
    if (t) return t;
  }
  return undefined;
}

export function iconFor(ctx: TemplateContext, figmaName: string | undefined): IconAsset | undefined {
  return figmaName ? ctx.icons.get(figmaName) : undefined;
}

export interface DocSection {
  heading?: string;
  level: 3 | 4;
  paragraphs: string[];
}

export interface DocTab {
  title: string;
  nodeId: string;
  sections: DocSection[];
}

/** Sections that describe Figma's own state, not the component; reported elsewhere, not published. */
const FIGMA_ONLY_SECTIONS = /^(live demo|accessibility testing status|flags)$/i;

/** First substantial sentence-like text in the docs (used when the set has no description). */
export function leadSentence(frames: IRDocFrame[]): string {
  for (const f of frames) for (const b of f.blocks) if ((b.fontSize ?? 0) >= 15 && b.text.length > 40 && /[.!]$/.test(b.text.trim())) return b.text.trim();
  return '';
}

/** Figma doc frames -> tabs of headed sections. Text is kept verbatim; only structure is inferred from font size. */
export function docTabs(frames: IRDocFrame[], componentName: string): DocTab[] {
  const seen = new Set<string>();
  const tabs: DocTab[] = [];
  const tabNames = new Set(frames.map((f) => (f.name.replace(/^documentation\s*\/?\s*/i, '').trim() || 'Documentation').toLowerCase()));
  for (const f of frames) {
    if (seen.has(f.nodeId)) continue;
    seen.add(f.nodeId);
    const title = f.name.replace(/^documentation\s*\/?\s*/i, '').trim() || 'Documentation';
    const sections: DocSection[] = [];
    let current: DocSection = { level: 3, paragraphs: [] };
    for (const b of f.blocks) {
      const size = b.fontSize ?? 12;
      const short = b.text.length <= 60 && !b.text.includes('\n');
      if (size >= 30 && b.text.trim().toLowerCase() === componentName.toLowerCase()) continue;
      if (short && size >= 18) {
        if (current.heading || current.paragraphs.length) sections.push(current);
        current = { heading: b.text, level: 3, paragraphs: [] };
      } else if (short && size >= 16 && b.text.split(' ').length <= 6) {
        if (current.heading || current.paragraphs.length) sections.push(current);
        current = { heading: b.text, level: 4, paragraphs: [] };
      } else {
        current.paragraphs.push(b.text);
      }
    }
    if (current.heading || current.paragraphs.length) sections.push(current);
    const kept = sections
      .filter((sec) => !(sec.heading && FIGMA_ONLY_SECTIONS.test(sec.heading.trim())))
      .map((sec) => ({ ...sec, paragraphs: sec.paragraphs.filter((p) => !tabNames.has(p.trim().toLowerCase()) && !/^on this page:/i.test(p.trim())) }))
      .filter((sec) => sec.heading || sec.paragraphs.length)
      // A heading that only repeats a tab name ("Usage" under the Usage tab) is dropped, its text kept.
      .map((sec) => (sec.heading && tabNames.has(sec.heading.trim().toLowerCase()) ? { ...sec, heading: undefined } : sec));
    tabs.push({ title, nodeId: f.nodeId, sections: kept });
  }
  return tabs;
}

export function docsJson(ctx: TemplateContext, setsUsed: IRComponentSet[], name: string, description: string, mapping: ComponentReport['props'], notes: string[] = []): string {
  const frames = setsUsed.flatMap((s) => s.docFrames);
  description = description || leadSentence(frames);
  return JSON.stringify(
    {
      component: name,
      description,
      figma: { fileKey: ctx.fileKey, version: ctx.version, sets: setsUsed.map((s) => ({ name: s.name, nodeId: s.nodeId })) },
      mapping,
      notes,
      tabs: docTabs(frames, name),
    },
    null,
    2,
  ) + '\n';
}

/** Escapes a string for a single-quoted TS string literal. */
export const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

export function mdxPage(name: string, title: string, sections: { heading: string; story: string; note?: string }[]): string {
  return `{/* Generated by ds-sync from Figma. Do not edit by hand; edit the Figma docs or the generator. */}
import { Meta, Title, Subtitle, Canvas, Controls } from '@storybook/addon-docs/blocks';
import * as Stories from './${name}.stories';
import { FigmaDocs } from '../../storybook/FigmaDocs';
import docs from './${name}.figma.json';

<Meta of={Stories} />

<Title>${title}</Title>

<Subtitle>{docs.description}</Subtitle>

<Canvas of={Stories.Default} />

<Controls of={Stories.Default} />

${sections.map((s) => `## ${s.heading}\n\n${s.note ? `${s.note}\n\n` : ''}<Canvas of={Stories.${s.story}} />`).join('\n\n')}

<FigmaDocs docs={docs} />
`;
}
