// Code mode: the public API of components that already exist in code, read with the TypeScript checker from the
// package (or source module) a customer imports them from. Works for plain function components, forwardRef and
// polymorphic components: a small probe file asks the checker for the props of each export.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';

import type { CodePropType } from './analyze.ts';

export interface ApiProp {
  name: string;
  type: CodePropType;
  optional: boolean;
  description?: string;
  /** Default from a JSDoc @default tag, when the library states one. */
  default?: string;
}

export interface ComponentApi {
  /** Export name in the module. */
  export: string;
  found: boolean;
  /** Props the component declares itself (not inherited DOM or React attributes). */
  props: ApiProp[];
  /** Inherited attribute names (DOM, ARIA, React), for reference. */
  inherited: string[];
  accepts: { children: boolean };
}

export interface CodeSource {
  /** Module the components are imported from, e.g. "@carbon/react" or "./src/components". */
  from: string;
  /** Folder whose node_modules (and tsconfig paths) resolve that module. */
  root: string;
}

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowJs: false,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
};

function describe(type: ts.Type, checker: ts.TypeChecker): CodePropType {
  const parts = type.isUnion() ? type.types : [type];
  const meaningful = parts.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)));
  if (meaningful.length && meaningful.every((t) => t.flags & ts.TypeFlags.BooleanLiteral)) return { kind: 'boolean' };
  if (meaningful.length && meaningful.every((t) => t.isStringLiteral() || t.isNumberLiteral())) return { kind: 'enum', options: meaningful.map((t) => String((t as ts.LiteralType).value)) };
  const text = checker.typeToString(type);
  if (/ReactNode|ReactElement|JSX\.Element/.test(text)) return { kind: 'node' };
  if (/ElementType|ComponentType|FunctionComponent|ComponentClass/.test(text)) return { kind: 'other', text: 'component' };
  if (meaningful.length === 1 && meaningful[0]!.flags & ts.TypeFlags.StringLike) return { kind: 'string' };
  if (meaningful.length === 1 && meaningful[0]!.flags & ts.TypeFlags.NumberLike) return { kind: 'number' };
  return { kind: 'other', text: text.length > 120 ? `${text.slice(0, 117)}...` : text };
}

/** A declaration that belongs to React's or the DOM's own typings: an inherited attribute, not the component's API. */
const inheritedFile = (file: string) => /[\\/]node_modules[\\/](@types[\\/]react|typescript)[\\/]/.test(file);

export function readComponentApis(src: CodeSource, exports: string[]): Map<string, ComponentApi> {
  const root = resolve(src.root);
  const probe = join(root, `.ds-sync-probe-${process.pid}.tsx`);
  const ident = (e: string) => `P_${e.replace(/\W/g, '_')}`;
  writeFileSync(probe, [
    `import * as M from ${JSON.stringify(src.from)};`,
    ...exports.map((e) => `export type ${ident(e)} = typeof M extends { ${JSON.stringify(e)}: infer C } ? (C extends (p: infer P, ...a: any[]) => any ? P : C extends new (p: infer P, ...a: any[]) => any ? P : C extends { (p: infer P): any } ? P : never) : never;`),
    '',
  ].join('\n'));
  const out = new Map<string, ComponentApi>();
  try {
    const program = ts.createProgram([probe], OPTIONS);
    const checker = program.getTypeChecker();
    const sf = program.getSourceFile(probe)!;
    const aliases = new Map<string, ts.TypeAliasDeclaration>();
    let moduleSymbol: ts.Symbol | undefined;
    sf.forEachChild((n) => {
      if (ts.isTypeAliasDeclaration(n)) aliases.set(n.name.text, n);
      if (ts.isImportDeclaration(n)) moduleSymbol = checker.getSymbolAtLocation(n.moduleSpecifier);
    });
    const moduleExportsList = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
    // Fallback for components typed through helpers that hide their props (Omit over a polymorphic type): the
    // "<Name>BaseProps" or "<Name>Props" interface declared next to the component.
    const declaredProps = (e: string): ts.Symbol[] => {
      let sym = moduleExportsList.find((x) => x.name === e);
      if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
      const file = sym?.declarations?.[0]?.getSourceFile();
      if (!file) return [];
      let found: ts.InterfaceDeclaration | undefined;
      for (const name of [`${e}BaseProps`, `${e}Props`]) {
        file.forEachChild((n) => { if (!found && ts.isInterfaceDeclaration(n) && n.name.text === name && !n.typeParameters?.length) found = n; });
        if (found) break;
      }
      return found ? checker.getPropertiesOfType(checker.getTypeAtLocation(found.name)) : [];
    };
    for (const e of exports) {
      const alias = aliases.get(ident(e))!;
      const t = checker.getTypeAtLocation(alias.name);
      if (t.flags & ts.TypeFlags.Never || t.flags & ts.TypeFlags.Any) { out.set(e, { export: e, found: false, props: [], inherited: [], accepts: { children: false } }); continue; }
      const props: ApiProp[] = [];
      const inherited: string[] = [];
      const own = (sy: ts.Symbol) => (sy.declarations ?? []).some((d) => !inheritedFile(d.getSourceFile().fileName));
      let symbols = checker.getPropertiesOfType(t);
      if (!symbols.some((sy) => own(sy) && !['as', 'ref', 'key'].includes(sy.name))) symbols = [...symbols, ...declaredProps(e).filter((sy) => !symbols.some((x) => x.name === sy.name))];
      for (const sym of symbols) {
        const decls = sym.declarations ?? [];
        if (!decls.length || decls.every((d) => inheritedFile(d.getSourceFile().fileName))) { inherited.push(sym.name); continue; }
        if (sym.name === 'as' || sym.name === 'ref' || sym.name === 'key') continue;
        const type = checker.getTypeOfSymbolAtLocation(sym, alias);
        const p: ApiProp = { name: sym.name, type: describe(type, checker), optional: Boolean(sym.flags & ts.SymbolFlags.Optional) };
        const doc = ts.displayPartsToString(sym.getDocumentationComment(checker)).trim();
        if (doc) p.description = doc.replace(/\s+/g, ' ');
        const def = sym.getJsDocTags(checker).find((x) => x.name === 'default' || x.name === 'defaultValue');
        if (def?.text) p.default = ts.displayPartsToString(def.text).trim().replace(/^['"`]|['"`]$/g, '');
        props.push(p);
      }
      props.sort((a, b) => a.name.localeCompare(b.name));
      out.set(e, { export: e, found: true, props, inherited: inherited.sort(), accepts: { children: inherited.includes('children') || props.some((p) => p.name === 'children') } });
    }
  } finally {
    if (existsSync(probe)) rmSync(probe);
  }
  return out;
}

/** Names the module exports (to match generated components to code components by name). */
export function moduleExports(src: CodeSource): string[] {
  const root = resolve(src.root);
  const probe = join(root, `.ds-sync-probe-${process.pid}-x.ts`);
  writeFileSync(probe, `import * as M from ${JSON.stringify(src.from)};\nexport const m = M;\n`);
  try {
    const program = ts.createProgram([probe], OPTIONS);
    const checker = program.getTypeChecker();
    const sf = program.getSourceFile(probe)!;
    let names: string[] = [];
    sf.forEachChild((n) => {
      if (ts.isVariableStatement(n)) {
        const d = n.declarationList.declarations[0]!;
        names = checker.getPropertiesOfType(checker.getTypeAtLocation(d.name)).map((s) => s.name);
      }
    });
    return names.filter((n) => /^[A-Z]/.test(n)).sort();
  } finally {
    if (existsSync(probe)) rmSync(probe);
  }
}

const nameWords = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');

/** The code export for a generated component: the same name, the same words in another order (NotificationInline ->
 * InlineNotification, TextInputFluid -> FluidTextInput), or the name without a Figma "Default" / "Base" suffix. */
export function matchExport(name: string, exportsList: string[]): string | undefined {
  if (exportsList.includes(name)) return name;
  const byWords = new Map(exportsList.map((e) => [nameWords(e), e]));
  const w = nameWords(name);
  if (byWords.has(w)) return byWords.get(w);
  const bare = name.replace(/(Default|Base)$/, '');
  if (bare !== name && bare) return exportsList.includes(bare) ? bare : byWords.get(nameWords(bare));
  return undefined;
}
