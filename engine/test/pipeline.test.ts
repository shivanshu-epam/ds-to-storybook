import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { analyzeComponent, analyzeCss, definedVars, type CodeIR } from '../src/code/analyze.ts';
import type { LoadedConfig } from '../src/config.ts';
import { diffComponent } from '../src/diff/diff.ts';
import { FigmaHttpError, type FigmaReader } from '../src/figma/client.ts';
import { parseVariantName, toHex } from '../src/ir/build.ts';
import { extractIR } from '../src/ir/extract.ts';
import { renderReport } from '../src/report/html.ts';
import { buildSpec, canonicalStates, loadArchetype, stateKind } from '../src/spec/build.ts';
import { fileResponse, nodesResponse } from './fixtures/figma.ts';

const here = dirname(fileURLToPath(import.meta.url));
const engineDir = join(here, '..');
const repoDir = join(here, 'fixtures', 'repo');

const config: LoadedConfig = {
  baseDir: mkdtempSync(join(tmpdir(), 'ds-sync-')),
  repoDir,
  figma: { fileKey: 'FIXTURE' },
  repo: { path: repoDir, tokenCss: ['src/styles/tokens.css'] },
  components: [
    {
      id: 'ds.button',
      archetype: 'action',
      figma: { page: '↳ Button', componentSet: { id: '1:1', name: 'Button' }, docFrames: ['1:50'] },
      code: { file: 'src/components/Button/Button.tsx', export: 'Button', stories: 'src/components/Button/Button.stories.tsx', css: 'src/components/Button/Button.module.css' },
    },
  ],
};

function reader(opts: { variables?: boolean } = {}): FigmaReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async file() {
      calls.push('file');
      return structuredClone(fileResponse);
    },
    async nodes(_key, ids) {
      calls.push(`nodes:${ids.join(',')}`);
      return structuredClone(nodesResponse);
    },
    async fileWithIds() {
      calls.push('fileWithIds');
      return structuredClone(fileResponse);
    },
    async localVariables() {
      calls.push('variables');
      if (!opts.variables) throw new FigmaHttpError(403, 'https://api.figma.com/v1/files/FIXTURE/variables/local', 'Forbidden');
      return {
        meta: {
          variables: {
            'VariableID:1:1': { id: 'VariableID:1:1', name: 'color/action', variableCollectionId: 'c1', resolvedType: 'COLOR', codeSyntax: { WEB: 'var(--color-action)' }, valuesByMode: {} },
            'VariableID:2:1': { id: 'VariableID:2:1', name: 'space/4', variableCollectionId: 'c1', resolvedType: 'FLOAT', valuesByMode: {} },
          },
          variableCollections: { c1: { id: 'c1', name: 'semantic', modes: [] } },
        },
      };
    },
  };
}

describe('IR helpers', () => {
  it('parses variant names and colours', () => {
    expect(parseVariantName('Variant=Primary, Size=Sm')).toEqual({ Variant: 'Primary', Size: 'Sm' });
    expect(toHex({ r: 1, g: 1, b: 1, a: 1 })).toBe('#ffffff');
    expect(toHex({ r: 0, g: 0, b: 0, a: 1 }, 0.5)).toBe('#00000080');
  });

  it('canonicalises compound state names', () => {
    expect(canonicalStates('Error-Selected')).toEqual(['error', 'checked']);
    expect(canonicalStates('Focused')).toEqual(['focus']);
    expect(stateKind(['error', 'checked'])).toBe('prop');
    expect(stateKind(['hover'])).toBe('pseudo');
    expect(stateKind(['State9'])).toBe('unknown');
  });
});

describe('extractIR', () => {
  it('builds a deterministic IR and falls back when the Variables API is forbidden', async () => {
    const r = reader();
    const ir = await extractIR(r, config);
    expect(r.calls).toEqual(['file', 'nodes:1:1,1:50', 'variables']);
    expect(ir.variables.source).toBe('none');
    expect(ir.missing).toEqual([]);
    const set = ir.components[0]!;
    expect(set.key).toBe('set-key-button');
    expect(set.properties.map((p) => p.name)).toEqual(['Variant', 'Size', 'State', 'Has leading icon', 'Label']);
    expect(set.variants).toHaveLength(3);
    expect(set.variants[0]!.parts.find((p) => p.path === 'Icon')?.instanceOf).toBe('Icon/action/add');
    // Reading order: the title (y=0) comes before the body (y=40) whatever the layer order.
    expect(set.docFrames[0]!.blocks.map((b) => b.text)).toEqual(['Keyboard', 'Press Enter to activate.']);
    // Page names match case-insensitively; same input gives the same hash.
    const again = await extractIR(reader(), config);
    expect(again.components[0]!.hash).toBe(set.hash);
  });

  it('resolves variable names when the Variables API is available', async () => {
    const ir = await extractIR(reader({ variables: true }), config);
    expect(ir.variables.source).toBe('rest');
    const fill = ir.components[0]!.variants[0]!.style.fills[0]!;
    expect(fill).toEqual({ value: '#0055ff', variableId: 'VariableID:1:1', variableName: 'color/action' });
  });

  it('reports a component set it cannot find, by id or by name', async () => {
    const missingConfig = { ...config, components: [{ ...config.components[0]!, figma: { page: 'x', componentSet: { id: '9:9', name: 'Nope' } } }] };
    const ir = await extractIR(reader(), missingConfig);
    expect(ir.components).toHaveLength(0);
    expect(ir.missing[0]?.reason).toMatch(/not found/);
  });
});

describe('spec, code analysis and drift', async () => {
  const ir = await extractIR(reader(), config);
  const target = config.components[0]!;
  const spec = buildSpec(ir.components[0]!, ir, target, loadArchetype(join(engineDir, 'archetypes'), 'action'));
  const code = analyzeComponent(repoDir, target);
  const codeIR: CodeIR = { repoDir, tokenVars: definedVars([join(repoDir, 'src/styles/tokens.css')]), components: [code] };
  const drift = diffComponent(spec, code, codeIR);
  const titles = drift.findings.map((f) => `${f.severity}: ${f.title}`);

  it('splits variant axes into props and state axes into states', () => {
    expect(spec.props.map((p) => [p.figmaProperty, p.type.kind])).toEqual([
      ['Variant', 'enum'],
      ['Size', 'enum'],
      ['Has leading icon', 'boolean'],
      ['Label', 'string'],
    ]);
    expect(spec.states.map((s) => `${s.figmaValue}:${s.kind}`)).toEqual(['Default:base', 'Hover:pseudo', 'Disabled:prop']);
    expect(spec.variantMatrix).toMatchObject({ axes: ['Variant', 'Size'], stateAxes: ['State'], count: 3, fullCount: 18 });
    expect(spec.anatomy).toEqual(['Icon', 'Label']);
  });

  it('records archetype gaps and token binding', () => {
    expect(spec.gaps.map((g) => g.field)).toEqual(expect.arrayContaining(['states.pressed', 'states.focus', 'behaviour.keyboard.Space']));
    expect(spec.gaps.map((g) => g.field)).not.toContain('behaviour.keyboard.Enter');
    expect(spec.tokens.boundCount).toBe(6);
    expect(spec.tokens.rawCount).toBeGreaterThan(0);
  });

  it('reads props, defaults and inherited-free own props from TypeScript', () => {
    expect(code.found).toBe(true);
    const size = code.props.find((p) => p.name === 'size');
    expect(size).toMatchObject({ type: { kind: 'enum', options: ['xs', 'sm', 'md'] }, default: 'md', description: 'xs is code-only.' });
    expect(code.props.find((p) => p.name === 'loading')?.default).toBe('false');
  });

  it('finds raw CSS values and undefined variables', () => {
    const css = analyzeCss(join(repoDir, 'src/components/Button/Button.module.css'), 'Button.module.css');
    expect(css.rawValues.map((r) => r.value)).toEqual(['#ffffff', '32px']);
    expect(css.varRefs).toContain('--radius-missing');
  });

  it('reports the drift a reviewer would expect', () => {
    expect(titles).toEqual(
      expect.arrayContaining([
        'warning: "variant" is missing Figma option(s): Tertiary',
        'info: "size" has code-only option(s): xs',
        'warning: Default differs for "size": Figma Sm, code md',
        'info: Code-only prop "loading"',
        'warning: Figma property "Label" has no matching code prop',
        'error: 1 CSS variable(s) used but not defined by tokens',
        'warning: No story shows the "Size" axis',
        'warning: No keyboard story',
        'warning: No MDX docs page found',
      ]),
    );
    expect(drift.mappings.find((m) => m.figmaProperty === 'Has leading icon')).toEqual({ figmaProperty: 'Has leading icon', codeProp: 'leadingIcon', mappedBy: 'name-match' });
    // Disabled exists in code, so the Disabled state raises nothing.
    expect(titles.some((t) => t.includes('Disabled'))).toBe(false);
  });

  it('renders an escaped, self-contained HTML report', () => {
    const html = renderReport({ ir, drifts: [drift], generatedAt: '2026-11-12T00:00:00Z', repoLabel: '<repo>' });
    expect(html).toContain('<title>Design System Health</title>');
    expect(html).toContain('&lt;repo&gt;');
    expect(html).not.toMatch(/<script/);
  });

  it('is deterministic for the same input', async () => {
    const ir2 = await extractIR(reader(), config);
    const spec2 = buildSpec(ir2.components[0]!, ir2, target, loadArchetype(join(engineDir, 'archetypes'), 'action'));
    expect(JSON.stringify(spec2)).toBe(JSON.stringify(spec));
  });
});

describe('archetype packs', () => {
  it('load and declare keyboard behaviour', () => {
    for (const id of ['action', 'selection.binary', 'disclosure']) {
      const a = loadArchetype(join(engineDir, 'archetypes'), id);
      expect(a.id).toBe(id);
      expect(a.keyboard.length).toBeGreaterThan(0);
      expect(readFileSync(join(engineDir, 'archetypes', `${id}.yaml`), 'utf8')).toContain('pattern:');
    }
  });
});
