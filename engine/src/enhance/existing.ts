// Enhance mode (decision 6): a team that already has a Storybook gets additions, not a replacement. This reads their
// story files (CSF, JavaScript or TypeScript) with the TypeScript parser: the title, the component, and each story's
// args, argTypes and the elements it renders, so they can be checked against Figma.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

export type Lit = string | number | boolean | null;

export interface ExistingStory {
  export: string;
  args: Record<string, Lit>;
  /** JSX elements the story renders (by local name) with the literal attributes set on each. */
  renders: { tag: string; attrs: Record<string, Lit> }[];
}

export interface ExistingFile {
  file: string;
  title?: string;
  /** The meta's component, by local name. */
  component?: string;
  /** Local name -> import (module and imported name). */
  imports: Record<string, { from: string; imported: string }>;
  args: Record<string, Lit>;
  /** Prop -> its control's options (enum props), or [] when the prop has a control without options. */
  argTypes: Record<string, string[]>;
  stories: ExistingStory[];
}

type Value = Lit | Value[] | { [k: string]: Value } | undefined;

export function readStoriesFile(file: string, root = ''): ExistingFile {
  const text = readFileSync(file, 'utf8');
  const kind = /\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const consts = new Map<string, ts.Expression>();
  const imports: ExistingFile['imports'] = {};
  const out: ExistingFile = { file: root ? relative(root, file) : file, imports, args: {}, argTypes: {}, stories: [] };
  const storyNodes = new Map<string, ts.Node[]>();
  const assigned = new Map<string, Record<string, ts.Expression>>();

  const unwrap = (e: ts.Expression): ts.Expression => (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e);
  // Literal values, objects (with spreads of top-level constants) and arrays; anything else is undefined.
  const value = (e: ts.Expression | undefined, depth = 0): Value => {
    if (!e || depth > 8) return undefined;
    e = unwrap(e);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isNumericLiteral(e)) return Number(e.text);
    if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (e.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (e.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isIdentifier(e)) return consts.has(e.text) ? value(consts.get(e.text), depth + 1) : undefined;
    if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap((x) => (ts.isSpreadElement(x) ? ((value(x.expression, depth + 1) as Value[] | undefined) ?? []) : [value(x, depth + 1)]));
    if (ts.isObjectLiteralExpression(e)) {
      const o: Record<string, Value> = {};
      for (const p of e.properties) {
        if (ts.isSpreadAssignment(p)) Object.assign(o, (value(p.expression, depth + 1) as Record<string, Value> | undefined) ?? {});
        else if (ts.isPropertyAssignment(p)) o[p.name.getText(sf).replace(/^['"]|['"]$/g, '')] = value(p.initializer, depth + 1);
        else if (ts.isShorthandPropertyAssignment(p)) o[p.name.text] = value(p.name, depth + 1);
      }
      return o;
    }
    return undefined;
  };
  const lits = (v: Value): Record<string, Lit> => Object.fromEntries(Object.entries((v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, Value>).filter(([, x]) => x === null || ['string', 'number', 'boolean'].includes(typeof x)) as [string, Lit][]);
  const argTypesOf = (v: Value): Record<string, string[]> => Object.fromEntries(Object.entries((v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, Value>).map(([k, x]) => {
    const opts = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, Value>).options : undefined;
    return [k, Array.isArray(opts) ? opts.filter((o): o is string => typeof o === 'string') : []];
  }));
  const objectOf = (e: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined => {
    if (!e) return undefined;
    e = unwrap(e);
    if (ts.isObjectLiteralExpression(e)) return e;
    if (ts.isIdentifier(e) && consts.has(e.text)) return objectOf(consts.get(e.text));
    return undefined;
  };
  const prop = (o: ts.ObjectLiteralExpression | undefined, name: string) => o?.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === name)?.initializer;

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause) {
      const from = st.moduleSpecifier.text;
      if (st.importClause.name) imports[st.importClause.name.text] = { from, imported: 'default' };
      const nb = st.importClause.namedBindings;
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) imports[el.name.text] = { from, imported: (el.propertyName ?? el.name).text };
    }
    if (ts.isVariableStatement(st)) {
      const exported = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        consts.set(d.name.text, d.initializer);
        if (exported) storyNodes.set(d.name.text, [d.initializer]);
      }
    }
    if (ts.isFunctionDeclaration(st) && st.name && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && !st.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) storyNodes.set(st.name.text, [st]);
    // Story.args = {...}, Story.argTypes = {...}
    if (ts.isExpressionStatement(st) && ts.isBinaryExpression(st.expression) && st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(st.expression.left) && ts.isIdentifier(st.expression.left.expression)) {
      const story = st.expression.left.expression.text;
      assigned.set(story, { ...(assigned.get(story) ?? {}), [st.expression.left.name.text]: st.expression.right });
    }
  }
  // The meta: export default { ... } or export default meta.
  const def = sf.statements.find((s): s is ts.ExportAssignment => ts.isExportAssignment(s) && !s.isExportEquals);
  const meta = objectOf(def?.expression);
  if (meta) {
    const t = value(prop(meta, 'title'));
    if (typeof t === 'string') out.title = t;
    const c = prop(meta, 'component');
    if (c && ts.isIdentifier(unwrap(c))) out.component = (unwrap(c) as ts.Identifier).text;
    out.args = lits(value(prop(meta, 'args')));
    out.argTypes = argTypesOf(value(prop(meta, 'argTypes')));
  }
  const jsx = (node: ts.Node): ExistingStory['renders'] => {
    const found: ExistingStory['renders'] = [];
    const visit = (n: ts.Node) => {
      if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
        const attrs: Record<string, Lit> = {};
        for (const a of n.attributes.properties) {
          if (!ts.isJsxAttribute(a)) continue;
          const name = a.name.getText(sf);
          if (!a.initializer) attrs[name] = true;
          else if (ts.isStringLiteral(a.initializer)) attrs[name] = a.initializer.text;
          else if (ts.isJsxExpression(a.initializer) && a.initializer.expression) { const v = value(a.initializer.expression); if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) attrs[name] = v as Lit; }
        }
        found.push({ tag: n.tagName.getText(sf), attrs });
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  };
  for (const [name, nodes] of storyNodes) {
    const init = nodes[0]!;
    const obj = ts.isFunctionDeclaration(init) ? undefined : objectOf(init as ts.Expression);
    // Not a story: helper objects that are not stories (a function story, or an object with args, render or name).
    const isStory = ts.isFunctionDeclaration(init) || ts.isArrowFunction(unwrap(init as ts.Expression)) || ts.isFunctionExpression(unwrap(init as ts.Expression)) || Boolean(obj && ['args', 'render', 'name', 'play', 'parameters', 'argTypes'].some((k) => prop(obj, k)));
    if (!isStory) continue;
    const extra = assigned.get(name) ?? {};
    const args = { ...lits(value(prop(obj, 'args'))), ...lits(value(extra.args)) };
    const argTypes = { ...argTypesOf(value(prop(obj, 'argTypes'))), ...argTypesOf(value(extra.argTypes)) };
    for (const [k, v] of Object.entries(argTypes)) if (v.length || !(k in out.argTypes)) out.argTypes[k] = [...new Set([...(out.argTypes[k] ?? []), ...v])];
    out.stories.push({ export: name, args, renders: jsx(init) });
  }
  return out;
}

/** Every story file under a folder (node_modules and build output skipped). */
export function findStoryFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n.startsWith('.') || n === 'storybook-static' || n === 'dist') continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.stories\.(jsx?|tsx?|mjs)$/.test(n) && !/\.figma\.stories\./.test(n)) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}
