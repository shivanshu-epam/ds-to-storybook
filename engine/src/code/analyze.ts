import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import type { ComponentTarget } from '../config.ts';

export type CodePropType =
  | { kind: 'enum'; options: string[] }
  | { kind: 'boolean' }
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'node' }
  | { kind: 'other'; text: string };

export interface CodeProp {
  name: string;
  type: CodePropType;
  optional: boolean;
  default?: string;
  description?: string;
}

export interface CssInfo {
  file: string;
  /** Custom properties referenced with var(). */
  varRefs: string[];
  /** Custom properties declared in this file (component-local aliases). */
  localVars: string[];
  /** Raw design values outside var(): colours and non-zero px lengths, with line numbers. */
  rawValues: { line: number; value: string; declaration: string }[];
}

export interface CodeComponent {
  targetId: string;
  file: string;
  export: string;
  found: boolean;
  /** Props declared in the component's own file. */
  props: CodeProp[];
  /** Props inherited from other declarations (e.g. DOM attributes), names only. */
  inheritedProps: string[];
  css?: CssInfo;
  stories?: { file: string; title?: string; exports: string[] };
  mdx?: { file: string; headings: string[] };
  notes: string[];
}

export interface CodeIR {
  repoDir: string;
  /** Custom properties defined by the token CSS files. */
  tokenVars: string[];
  components: CodeComponent[];
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
};

function describeType(type: ts.Type, checker: ts.TypeChecker): CodePropType {
  const parts = type.isUnion() ? type.types : [type];
  const meaningful = parts.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
  if (meaningful.length > 0 && meaningful.every((t) => t.flags & ts.TypeFlags.BooleanLiteral)) return { kind: 'boolean' };
  if (meaningful.length > 0 && meaningful.every((t) => t.isStringLiteral() || t.isNumberLiteral())) {
    return { kind: 'enum', options: meaningful.map((t) => String((t as ts.LiteralType).value)) };
  }
  const text = checker.typeToString(type);
  if (/ReactNode|ReactElement|JSX\.Element/.test(text)) return { kind: 'node' };
  if (meaningful.length === 1 && meaningful[0]!.flags & ts.TypeFlags.String) return { kind: 'string' };
  if (meaningful.length === 1 && meaningful[0]!.flags & ts.TypeFlags.Number) return { kind: 'number' };
  return { kind: 'other', text: text.length > 120 ? text.slice(0, 117) + '...' : text };
}

function findComponentFunction(sf: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | undefined {
  let found: ts.FunctionLikeDeclaration | undefined;
  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          found = d.initializer;
        }
      }
    }
  });
  return found;
}

/** Defaults from `({ a = 1 })` and from `const { a = 1 } = props` in the body. */
function collectDefaults(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): Record<string, string> {
  const out: Record<string, string> = {};
  const fromPattern = (pattern: ts.ObjectBindingPattern) => {
    for (const el of pattern.elements) {
      const name = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : undefined;
      if (name && el.initializer) out[name] = el.initializer.getText(sf).replace(/^['"`]|['"`]$/g, '');
    }
  };
  const param = fn.parameters[0];
  if (!param) return out;
  if (ts.isObjectBindingPattern(param.name)) fromPattern(param.name);
  if (ts.isIdentifier(param.name) && fn.body && ts.isBlock(fn.body)) {
    const paramName = param.name.text;
    for (const stmt of fn.body.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const d of stmt.declarationList.declarations) {
        if (ts.isObjectBindingPattern(d.name) && d.initializer && ts.isIdentifier(d.initializer) && d.initializer.text === paramName) fromPattern(d.name);
      }
    }
  }
  return out;
}

export function analyzeProps(absFile: string, exportName: string): { found: boolean; props: CodeProp[]; inheritedProps: string[]; notes: string[] } {
  const program = ts.createProgram([absFile], COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(absFile);
  const notes: string[] = [];
  if (!sf) return { found: false, props: [], inheritedProps: [], notes: [`Could not read ${absFile}.`] };
  const fn = findComponentFunction(sf, exportName);
  const param = fn?.parameters[0];
  if (!fn || !param) return { found: Boolean(fn), props: [], inheritedProps: [], notes: [fn ? `${exportName} takes no props.` : `Export ${exportName} not found.`] };

  const propsType = checker.getTypeAtLocation(param);
  // A union of prop shapes (e.g. single | multiple modes): merge the members' properties.
  const symbols = new Map<string, ts.Symbol>();
  const constituents = propsType.isUnion() ? propsType.types : [propsType];
  for (const t of constituents) for (const s of checker.getPropertiesOfType(t)) if (!symbols.has(s.name)) symbols.set(s.name, s);

  const defaults = collectDefaults(fn, sf);
  const props: CodeProp[] = [];
  const inheritedProps: string[] = [];
  for (const sym of symbols.values()) {
    const decl = sym.declarations?.[0];
    const own = decl?.getSourceFile().fileName === sf.fileName;
    if (!own) {
      inheritedProps.push(sym.name);
      continue;
    }
    // For union members, describe the property across all constituents that declare it.
    const types = constituents
      .map((t) => checker.getPropertyOfType(t, sym.name))
      .filter((s): s is ts.Symbol => Boolean(s))
      .map((s) => checker.getTypeOfSymbolAtLocation(s, param));
    const merged = types.length > 1 ? describeMerged(types, checker) : describeType(types[0] ?? checker.getTypeOfSymbolAtLocation(sym, param), checker);
    const prop: CodeProp = { name: sym.name, type: merged, optional: Boolean(sym.flags & ts.SymbolFlags.Optional) };
    const d = defaults[sym.name];
    if (d !== undefined) prop.default = d;
    const doc = ts.displayPartsToString(sym.getDocumentationComment(checker)).trim();
    if (doc) prop.description = doc;
    props.push(prop);
  }
  for (const name of Object.keys(defaults)) {
    if (!symbols.has(name)) notes.push(`Default for "${name}" has no matching prop.`);
  }
  props.sort((a, b) => a.name.localeCompare(b.name));
  inheritedProps.sort();
  return { found: true, props, inheritedProps, notes };
}

function describeMerged(types: ts.Type[], checker: ts.TypeChecker): CodePropType {
  const described = types.map((t) => describeType(t, checker));
  if (described.every((d) => d.kind === 'enum')) {
    return { kind: 'enum', options: [...new Set(described.flatMap((d) => (d.kind === 'enum' ? d.options : [])))] };
  }
  return described[0] ?? { kind: 'other', text: 'unknown' };
}

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;
const RAW_PX = /(?<![\w-])(-?\d*\.?\d+)px\b/g;

export function analyzeCss(absFile: string, relFile: string): CssInfo {
  const text = readFileSync(absFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const varRefs = new Set<string>();
  const localVars = new Set<string>();
  const rawValues: CssInfo['rawValues'] = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[\w-]+)/g)) varRefs.add(m[1]!);
    const decl = /^\s*(--[\w-]+)\s*:/.exec(line);
    if (decl) localVars.add(decl[1]!);
    const value = line.includes(':') ? line.slice(line.indexOf(':') + 1) : '';
    const outsideVar = value.replace(/var\([^)]*\)/g, '');
    for (const m of outsideVar.matchAll(RAW_COLOR)) rawValues.push({ line: i + 1, value: m[0], declaration: line.trim() });
    for (const m of outsideVar.matchAll(RAW_PX)) {
      if (Number(m[1]) !== 0) rawValues.push({ line: i + 1, value: m[0], declaration: line.trim() });
    }
  });
  return { file: relFile, varRefs: [...varRefs].sort(), localVars: [...localVars].sort(), rawValues };
}

export function definedVars(absFiles: string[]): string[] {
  const out = new Set<string>();
  for (const f of absFiles) {
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) out.add(m[1]!);
  }
  return [...out].sort();
}

export function analyzeStories(absFile: string, relFile: string): CodeComponent['stories'] {
  const text = readFileSync(absFile, 'utf8');
  const title = /\btitle:\s*['"`]([^'"`]+)['"`]/.exec(text)?.[1];
  const exports = [...text.matchAll(/^export const (\w+)\s*[:=]/gm)].map((m) => m[1]!);
  return title ? { file: relFile, title, exports } : { file: relFile, exports };
}

export function analyzeMdx(absFile: string, relFile: string): CodeComponent['mdx'] {
  const headings = [...readFileSync(absFile, 'utf8').matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1]!.trim());
  return { file: relFile, headings };
}

export function analyzeComponent(repoDir: string, target: ComponentTarget): CodeComponent {
  const abs = (rel: string) => join(repoDir, rel);
  if (!target.code) return { targetId: target.id, file: '', export: '', found: false, props: [], inheritedProps: [], notes: ['No code configured for this component.'] };
  const code = target.code;
  const result: CodeComponent = { targetId: target.id, file: code.file, export: code.export, found: false, props: [], inheritedProps: [], notes: [] };
  if (!existsSync(abs(code.file))) {
    result.notes.push(`File ${code.file} not found.`);
    return result;
  }
  const props = analyzeProps(abs(code.file), code.export);
  Object.assign(result, props);
  const { css, stories, mdx } = code;
  if (css && existsSync(abs(css))) result.css = analyzeCss(abs(css), css);
  if (stories && existsSync(abs(stories))) result.stories = analyzeStories(abs(stories), stories);
  if (mdx && existsSync(abs(mdx))) result.mdx = analyzeMdx(abs(mdx), mdx);
  return result;
}
