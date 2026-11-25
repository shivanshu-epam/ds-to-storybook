// Enhance mode: the team's existing stories checked against Figma (through the code map), and only what is missing
// added, in a file next to theirs ("<Name>.figma.stories.*", titled "<their title>/Figma coverage"). Their files are
// never edited.
import { basename, dirname, extname, join } from 'node:path';

import type { ComponentApi } from '../code/api.ts';
import type { CodeMapEntry, PropMapping, ValueTarget } from '../code/map.ts';
import type { IRComponentSet } from '../ir/types.ts';
import type { ExistingFile, Lit } from './existing.ts';

export type EnhanceStatus = 'shown' | 'control' | 'interactive' | 'missing' | 'no-code';

export interface EnhanceItem {
  figma: string;
  value?: string;
  /** How code sets it: "kind=danger--primary", "isExpressive=true", "<ButtonSkeleton>". */
  code: string;
  status: EnhanceStatus;
}

export interface EnhanceComponent {
  component: string;
  export: string;
  /** The team's story file for this component, when there is one. */
  file?: string;
  items: EnhanceItem[];
  /** Stories ds-sync adds (the missing values). */
  added: string[];
}

export interface EnhanceInput {
  existing: ExistingFile[];
  /** Root the existing files' paths are relative to. */
  root: string;
  from: string;
  components: { name: string; sets: IRComponentSet[]; entry: CodeMapEntry; api: ComponentApi }[];
}

const js = (v: unknown) => JSON.stringify(v);
const ident = (s: string) => {
  const n = s.replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase());
  return /^[0-9]/.test(n) ? `S${n}` : n || 'Story';
};

/** The code args (or separate component) one Figma value becomes. */
function codeOf(m: PropMapping, t: ValueTarget | null | undefined): { args?: Record<string, Lit>; component?: string; css?: string } | undefined {
  if (!t) return undefined;
  if ('css' in t) return { css: t.css };
  if ('component' in t) return { component: t.component };
  if ('prop' in t) return { args: { [t.prop]: t.value } };
  if (t.value === 'base') return { args: {} };
  if (!m.code) return undefined;
  return { args: { [m.code]: m.shape === 'axis-to-boolean' || m.shape === 'boolean' ? t.value === 'true' : t.value } };
}

export function enhance(x: EnhanceInput): { components: EnhanceComponent[]; files: { path: string; content: string }[]; report: string } {
  const results: EnhanceComponent[] = [];
  const files: { path: string; content: string }[] = [];
  for (const c of x.components) {
    const exp = c.entry.export;
    // The team's file whose meta component is this export (by its import).
    const file = x.existing.find((f) => f.component && (f.imports[f.component]?.imported === exp || (f.imports[f.component]?.imported === 'default' && f.component === exp)));
    const r: EnhanceComponent = { component: c.name, export: exp, ...(file ? { file: file.file } : {}), items: [], added: [] };
    results.push(r);
    if (!file) continue;
    // The local name a component is imported under in the team's file (a default import counts when its local name matches).
    const local = (name: string) => Object.entries(file.imports).find(([l, i]) => i.imported === name || (i.imported === 'default' && l === name))?.[0];
    const compLocal = file.component!;
    const sets = (args: Record<string, Lit>) => file.stories.some((s) => Object.entries(args).every(([k, v]) => s.args[k] === v || s.renders.some((rd) => rd.tag === compLocal && rd.attrs[k] === v)) || (Object.keys(args).length > 0 && Object.entries(args).every(([k, v]) => file.args[k] === v)));
    const missing: { label: string; figma: string; args?: Record<string, Lit>; component?: string }[] = [];
    for (const s of c.sets) {
      for (const p of s.properties.filter((p) => p.type === 'VARIANT')) {
        const m = c.entry.mappings.find((x) => x.figma === p.name);
        const targets = m?.values ?? (m?.code && m.shape === 'boolean' ? Object.fromEntries((p.options ?? []).map((o) => [o, { value: /^true$/i.test(o) ? 'true' : 'false' }])) : undefined);
        for (const o of p.options ?? []) {
          const t = targets?.[o];
          const code = m ? codeOf(m, t) : undefined;
          if (!m || !code) { r.items.push({ figma: p.name, value: o, code: '—', status: 'no-code' }); continue; }
          if (code.css) { r.items.push({ figma: p.name, value: o, code: `:${code.css}`, status: 'interactive' }); continue; }
          if (code.component) {
            const shown = file.stories.some((st) => st.renders.some((rd) => rd.tag === (local(code.component!) ?? code.component)));
            r.items.push({ figma: p.name, value: o, code: `<${code.component}>`, status: shown ? 'shown' : 'missing' });
            if (!shown) missing.push({ label: o, figma: `${p.name}=${o}`, component: code.component });
            continue;
          }
          const args = code.args ?? {};
          const label = Object.entries(args).map(([k, v]) => `${k}=${String(v)}`).join(', ') || 'default';
          // The Figma default is what every story renders unless it sets the prop.
          const isDefault = String(p.default) === o && file.stories.some((st) => st.renders.some((rd) => rd.tag === compLocal) || Object.keys(st.args).length === 0);
          const status: EnhanceStatus = isDefault || sets(args) ? 'shown'
            : Object.entries(args).every(([k, v]) => k in file.argTypes && (typeof v === 'boolean' || file.argTypes[k]!.includes(String(v)))) ? 'control' : 'missing';
          r.items.push({ figma: p.name, value: o, code: label, status });
          if (status !== 'shown') missing.push({ label: o, figma: `${p.name}=${o}`, args });
        }
      }
    }
    if (!missing.length) continue;
    // Copy the Figma text and the team's own default args, so added stories render like theirs.
    const base: Record<string, Lit> = { ...file.args };
    for (const s of c.sets) for (const p of s.properties.filter((p) => p.type === 'TEXT')) {
      const m = c.entry.mappings.find((x) => x.figma === p.name);
      if (m?.code && (m.shape === 'text' || m.shape === 'children')) base[m.code] = String(p.default);
    }
    const used = new Set<string>(file.stories.map((s) => s.export));
    const name = (s: string) => { let n = ident(s); for (let i = 2; used.has(n); i++) n = `${ident(s)}${i}`; used.add(n); return n; };
    const extra = [...new Set(missing.flatMap((mm) => (mm.component ? [mm.component] : [])))];
    const importLine = (names: string[]) => {
      const byModule = new Map<string, string[]>();
      for (const n of names) {
        const l = local(n);
        const imp = l ? file.imports[l]! : { from: x.from, imported: n };
        const spec = imp.imported === 'default' ? `default as ${l}` : imp.imported === (l ?? n) ? imp.imported : `${imp.imported} as ${l}`;
        byModule.set(imp.from, [...(byModule.get(imp.from) ?? []), spec]);
      }
      return [...byModule].map(([from, specs]) => `import { ${[...new Set(specs)].sort().join(', ')} } from ${js(from)};`).join('\n');
    };
    const comp = local(exp) ?? exp;
    const stories = missing.map((mm) => {
      const n = name(mm.label);
      r.added.push(`${n} (${mm.figma})`);
      return mm.component
        ? `/** Figma ${mm.figma}: its own component, ${mm.component}. */\nexport const ${n} = {\n  name: ${js(mm.label)},\n  render: (args) => <${local(mm.component) ?? mm.component} {...args} />,\n};`
        : `/** Figma ${mm.figma}. */\nexport const ${n} = {\n  name: ${js(mm.label)},\n  args: ${js(mm.args)},\n};`;
    });
    const ext = extname(file.file);
    const typed = /\.tsx?$/.test(ext);
    const content = `// Generated by ds-sync (enhance mode): stories for designs in Figma that ${basename(file.file)} does not show yet.
// Your stories stay as they are; this file only adds. Do not edit by hand: change Figma, the code map or your stories.
import React from 'react';
${importLine([exp, ...extra])}

export default {
  title: ${js(`${file.title ?? `Components/${exp}`}/Figma coverage`)},
  component: ${comp},
  args: ${js(base)},
  parameters: { figma: { component: ${js(c.sets[0]!.name)}, nodeId: ${js(c.sets[0]!.nodeId)} }, generator: 'ds-sync enhance' },
}${typed ? ' as Record<string, unknown>' : ''};

${stories.map((s) => (typed ? s.replace('render: (args) =>', 'render: (args: Record<string, unknown>) =>') : s)).join('\n\n')}
`;
    files.push({ path: join(dirname(file.file), `${basename(file.file).replace(/\.stories\.[^.]+$/, '')}.figma.stories${ext === '.ts' ? '.tsx' : ext === '.js' ? '.jsx' : ext}`), content });
  }
  return { components: results, files, report: report(results, x.from) };
}

function report(rs: EnhanceComponent[], from: string): string {
  const count = (s: EnhanceStatus) => rs.reduce((n, r) => n + r.items.filter((i) => i.status === s).length, 0);
  const withFile = rs.filter((r) => r.file);
  const lines = [
    '# Enhance: your stories against Figma',
    '',
    `Each Figma value of the components found in \`${from}\`, checked against your existing stories. Your files are not changed: missing designs are added as stories in a \`.figma.stories\` file next to yours.`,
    '',
    `- Components with your stories: ${withFile.length}/${rs.length}`,
    `- Figma values shown in your stories: ${count('shown')}`,
    `- Only reachable through a control: ${count('control')} (a story is added for each)`,
    `- Missing from your stories: ${count('missing')} (a story is added for each)`,
    `- Shown by interacting (hover, focus, press): ${count('interactive')}`,
    `- With no counterpart in code: ${count('no-code')} (see CODE-MAP.md)`,
    '',
  ];
  if (rs.length > withFile.length) lines.push(`No stories of yours found for: ${rs.filter((r) => !r.file).map((r) => r.export).join(', ')}. The react-code target generates complete stories for them.`, '');
  for (const r of withFile) {
    lines.push(`## ${r.export} (${r.file})`, '', '| Figma | Code | Your stories |', '| --- | --- | --- |');
    for (const i of r.items) lines.push(`| ${i.figma}${i.value ? `=${i.value}` : ''} | \`${i.code}\` | ${{ shown: 'shown', control: 'control only', interactive: 'by interaction', missing: '**missing**', 'no-code': 'not in code' }[i.status]} |`);
    lines.push('');
    if (r.added.length) lines.push(`Added: ${r.added.join(', ')}.`, '');
  }
  return lines.join('\n') + '\n';
}
