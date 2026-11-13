// How close the generated API is to a reference implementation (an existing component library), prop by prop.
// Used to measure the AI layer: decisions are made from Figma only; the reference is never shown to it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';

import type { Discovery } from '../discover/discover.ts';
import { propPlan } from '../generate/templates/generic.ts';
import type { FigmaIR } from '../ir/types.ts';

/** Props a reference component declares in its own folder: `type|interface <Name>Props`, read from the syntax
 * (following local type aliases, intersections and unions), so unresolved path aliases in the reference do not matter. */
export function referenceProps(root: string, name: string): string[] | null {
  const dir = resolve(root, name);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.(stories|test|spec|native)\./.test(f) && !/^_/.test(f));
  if (!files.length) return null;
  const decls = new Map<string, ts.TypeAliasDeclaration | ts.InterfaceDeclaration>();
  for (const f of files) {
    const sf = ts.createSourceFile(f, readFileSync(join(dir, f), 'utf8'), ts.ScriptTarget.ES2022, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    sf.forEachChild((n) => { if ((ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && !decls.has(n.name.text)) decls.set(n.name.text, n); });
  }
  const root0 = decls.get(`${name}Props`);
  if (!root0) return null;
  const out = new Set<string>();
  const seen = new Set<string>();
  const members = (ms: ts.NodeArray<ts.TypeElement>) => { for (const m of ms) if (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) out.add(m.name.text); };
  const visitDecl = (d: ts.TypeAliasDeclaration | ts.InterfaceDeclaration) => {
    if (seen.has(d.name.text)) return;
    seen.add(d.name.text);
    if (ts.isTypeAliasDeclaration(d)) visit(d.type);
    else {
      members(d.members);
      for (const h of d.heritageClauses ?? []) for (const t of h.types) if (ts.isIdentifier(t.expression)) { const x = decls.get(t.expression.text); if (x) visitDecl(x); }
    }
  };
  const visit = (t: ts.TypeNode): void => {
    if (ts.isTypeLiteralNode(t)) members(t.members);
    else if (ts.isIntersectionTypeNode(t) || ts.isUnionTypeNode(t)) t.types.forEach(visit);
    else if (ts.isParenthesizedTypeNode(t)) visit(t.type);
    else if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) { const x = decls.get(t.typeName.text); if (x) visitDecl(x); }
  };
  visitDecl(root0);
  return [...out];
}

/** Props that configure appearance or content, comparable with what Figma can specify. */
const NOT_COMPARABLE = /^(on[A-Z]|default[A-Z]|_|testID$|data|children$|ref$|key$|className$|style$|accessibilityLabel$|elementtiming$|maxWidth$|minWidth$|width$|zIndex$)/;
export const normalise = (p: string) => p.toLowerCase().replace(/^(is|show|has|with)(?=[a-z])/, '');

export interface EvalRow {
  component: string;
  reference: string[];
  ours: string[];
  matched: string[];
  missing: string[];
  extra: string[];
}

export function evaluate(ir: FigmaIR, discovery: Discovery, referenceRoot: string): { rows: EvalRow[]; reference: number; matched: number; ours: number } {
  const byNode = new Map(ir.components.map((s) => [s.nodeId, s]));
  const rows: EvalRow[] = [];
  for (const prop of discovery.proposals) {
    const set = byNode.get(prop.sets.main ?? Object.values(prop.sets)[0] ?? '');
    if (!set) continue;
    const ref = referenceProps(referenceRoot, prop.name);
    if (!ref?.length) continue;
    const reference = ref.filter((p) => !NOT_COMPARABLE.test(p));
    if (!reference.length) continue;
    const plan = propPlan(set);
    const ours = [...plan.axes.filter((a) => a.options.length > 1).map((a) => a.prop), ...plan.booleans.map((b) => b.prop), ...plan.texts.map((t) => t.prop), ...(plan.hasDisabled ? ['disabled'] : [])];
    const oursN = new Set(ours.map(normalise));
    const refN = new Set(reference.map(normalise));
    rows.push({
      component: prop.name, reference, ours,
      matched: reference.filter((p) => oursN.has(normalise(p))),
      missing: reference.filter((p) => !oursN.has(normalise(p))),
      extra: ours.filter((p) => !refN.has(normalise(p))),
    });
  }
  return { rows, reference: rows.reduce((n, r) => n + r.reference.length, 0), matched: rows.reduce((n, r) => n + r.matched.length, 0), ours: rows.reduce((n, r) => n + r.ours.length, 0) };
}

export function evalMarkdown(res: ReturnType<typeof evaluate>, label: string): string {
  const pct = res.reference ? Math.round((100 * res.matched) / res.reference) : 0;
  return [
    `# API evaluation against a reference library (${label})`,
    '',
    `${res.rows.length} component(s) found in the reference. Reference props that configure appearance or content (callbacks, uncontrolled defaults and test or styling props excluded): ${res.reference}. Same name in the generated API: **${res.matched} (${pct}%)**. Generated props: ${res.ours}.`,
    '',
    'Names are compared case-insensitively, ignoring an is/show/has/with prefix.',
    '',
    '| Component | Reference | Matched | Missing (reference only) | Extra (generated only) |',
    '| --- | --- | --- | --- | --- |',
    ...res.rows.map((r) => `| ${r.component} | ${r.reference.length} | ${r.matched.length} | ${r.missing.join(', ')} | ${r.extra.join(', ')} |`),
    '',
  ].join('\n');
}
