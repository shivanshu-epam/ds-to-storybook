import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseFigmaFileKey } from '../src/config.ts';
import { exportFromRest, loadTokens, tokensCss } from '../src/generate/tokens.ts';
import { detectStack } from '../src/init.ts';

describe('init helpers', () => {
  it('reads the file key from Figma links or a bare key', () => {
    expect(parseFigmaFileKey('https://www.figma.com/design/I983NcgqSiY14YkpJbwjG8/Design-system-AI?node-id=1-2')).toBe('I983NcgqSiY14YkpJbwjG8');
    expect(parseFigmaFileKey('https://www.figma.com/file/AbCdEfGhIjKl/Old-link')).toBe('AbCdEfGhIjKl');
    expect(parseFigmaFileKey('I983NcgqSiY14YkpJbwjG8')).toBe('I983NcgqSiY14YkpJbwjG8');
    expect(parseFigmaFileKey('not a link')).toBeUndefined();
  });

  it('detects framework, styling, package manager and Storybook', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-stack-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ workspaces: ['packages/*'], dependencies: { vue: '3' }, devDependencies: { tailwindcss: '4', storybook: '10.6.3', typescript: '5' } }));
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    expect(detectStack(dir)).toEqual({ hasPackageJson: true, framework: 'vue', styling: ['tailwind'], storybook: '10.6.3', typescript: true, packageManager: 'pnpm', monorepo: true });
    expect(detectStack(mkdtempSync(join(tmpdir(), 'ds-empty-'))).hasPackageJson).toBe(false);
  });
});

describe('Variables API → export format', () => {
  it('converts colours, modes and aliases so the token pipeline can use them', () => {
    const json = exportFromRest({
      meta: {
        variableCollections: {
          c1: { id: 'c1', name: 'primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          c2: { id: 'c2', name: 'semantic', modes: [{ modeId: 'l', name: 'light' }, { modeId: 'd', name: 'dark' }] },
        },
        variables: {
          v1: { id: 'v1', name: 'blue/600', variableCollectionId: 'c1', resolvedType: 'COLOR', codeSyntax: { WEB: 'var(--blue-600)' }, valuesByMode: { m1: { r: 0.31, g: 0.275, b: 0.898, a: 1 } } },
          v2: { id: 'v2', name: 'bg/primary', variableCollectionId: 'c2', resolvedType: 'COLOR', valuesByMode: { l: { type: 'VARIABLE_ALIAS', id: 'v1' }, d: { r: 0, g: 0, b: 0, a: 0.5 } } },
          v3: { id: 'v3', name: 'flag', variableCollectionId: 'c1', resolvedType: 'BOOLEAN', valuesByMode: { m1: true } },
        },
      },
    });
    expect(json.variables.primitives).toEqual([['blue/600', 'C', '#4f46e5', 'var(--blue-600)']]);
    expect(json.variables.semantic).toEqual([['bg/primary', 'C', { light: '@primitives:blue/600', dark: '#00000080' }, '']]);
    const css = tokensCss(loadTokens(json), { semantic: 'data-theme' });
    expect(css).toContain('--bg-primary: var(--blue-600);');
    expect(css).toContain('[data-theme="dark"] {\n  --bg-primary: #00000080;');
  });
});
