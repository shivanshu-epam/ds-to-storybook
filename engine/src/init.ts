/**
 * `ds-sync init`: set up a project in the current folder.
 * Asks only what it cannot detect: the Figma link, a token if none is set, and the output folder.
 */
import { appendFileSync, chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { parseFigmaFileKey, type Config } from './config.ts';
import { FigmaClient, FigmaHttpError } from './figma/client.ts';
import { loadDotEnv, writeText } from './util/core.ts';

export interface InitOptions {
  figma?: string;
  /** react | web-components | both. Default: chosen from the detected stack. */
  target?: string;
  dir?: string;
  variables?: string;
  yes?: boolean;
  ci?: boolean;
  log: (m: string) => void;
}

export interface StackInfo {
  hasPackageJson: boolean;
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'web-components' | 'unknown';
  styling: string[];
  storybook?: string;
  typescript: boolean;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
  monorepo: boolean;
}

/**
 * Output targets for a stack. React apps get native React components; every other stack
 * (and mixed or unknown ones) gets Web Components, which run in any framework.
 */
export function suggestTargets(stack: StackInfo): ('react' | 'web-components')[] {
  if (stack.framework === 'react') return stack.monorepo ? ['react', 'web-components'] : ['react'];
  return ['web-components'];
}

function targetReason(stack: StackInfo): string {
  if (stack.framework === 'react') return stack.monorepo ? 'React app in a monorepo: native React plus Web Components for other apps' : 'React app: native React components';
  if (stack.framework === 'unknown') return 'no framework detected: Web Components work everywhere';
  return `${stack.framework}: Web Components work natively in ${stack.framework}`;
}

/** Reads package.json and lockfiles; nothing is installed or changed. */
export function detectStack(dir: string): StackInfo {
  const pkgPath = join(dir, 'package.json');
  const pkg = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, Record<string, string> | undefined>) : undefined;
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}), ...(pkg?.peerDependencies ?? {}) };
  const has = (n: string) => n in deps;
  const framework: StackInfo['framework'] = has('react') ? 'react' : has('vue') ? 'vue' : has('@angular/core') ? 'angular' : has('svelte') ? 'svelte' : has('lit') ? 'web-components' : 'unknown';
  const styling = [
    has('tailwindcss') && 'tailwind',
    has('styled-components') && 'styled-components',
    (has('@emotion/react') || has('@emotion/styled')) && 'emotion',
    (has('sass') || has('node-sass')) && 'sass',
    has('@vanilla-extract/css') && 'vanilla-extract',
  ].filter(Boolean) as string[];
  const lock = (f: string) => existsSync(join(dir, f));
  const packageManager: StackInfo['packageManager'] = lock('pnpm-lock.yaml') ? 'pnpm' : lock('yarn.lock') ? 'yarn' : lock('bun.lockb') || lock('bun.lock') ? 'bun' : lock('package-lock.json') ? 'npm' : 'unknown';
  const info: StackInfo = {
    hasPackageJson: Boolean(pkg),
    framework,
    styling,
    typescript: has('typescript') || existsSync(join(dir, 'tsconfig.json')),
    packageManager,
    monorepo: Boolean(pkg && 'workspaces' in pkg) || lock('pnpm-workspace.yaml') || lock('nx.json') || lock('turbo.json'),
  };
  if (deps.storybook) info.storybook = deps.storybook;
  return info;
}

function ensureIgnored(dir: string, entries: string[]) {
  const path = join(dir, '.gitignore');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const missing = entries.filter((e) => !current.split(/\r?\n/).includes(e));
  if (missing.length) appendFileSync(path, `${current && !current.endsWith('\n') ? '\n' : ''}# ds-sync\n${missing.join('\n')}\n`);
}

export async function runInit(opts: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const interactive = !opts.yes && process.stdin.isTTY;
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
  const ask = async (q: string, fallback?: string) => {
    if (!rl) return fallback ?? '';
    const a = (await rl.question(fallback ? `${q} (${fallback}) ` : `${q} `)).trim();
    return a || fallback || '';
  };
  try {
    const configPath = join(cwd, 'ds-sync.config.json');
    if (existsSync(configPath) && interactive) {
      const again = await ask('ds-sync.config.json already exists. Overwrite? [y/N]', 'n');
      if (!/^y/i.test(again)) return opts.log('Kept the existing config.');
    }

    // 1. Figma file
    const fileKey = parseFigmaFileKey(opts.figma ?? (await ask('Figma design system link:')));
    if (!fileKey) throw new Error('A Figma file link (figma.com/design/<key>/...) or file key is required. Pass --figma <link>.');

    // 2. Token
    loadDotEnv(join(cwd, '.env'));
    if (!process.env.FIGMA_TOKEN) {
      opts.log('A Figma personal access token is needed (Figma > Settings > Security > Personal access tokens, scope file_content:read).');
      const token = await ask('Paste the token (stored in .env, git-ignored):');
      if (!token) throw new Error('No FIGMA_TOKEN. Set it in the environment or in .env, then run init again.');
      writeFileSync(join(cwd, '.env'), `FIGMA_TOKEN=${token}\n`, { flag: 'a' });
      chmodSync(join(cwd, '.env'), 0o600);
      process.env.FIGMA_TOKEN = token;
    }
    ensureIgnored(cwd, ['.env', '.ds-sync/']);

    // 3. Check access
    const client = new FigmaClient({ token: process.env.FIGMA_TOKEN!, cacheDir: join(cwd, '.ds-sync', 'cache'), refresh: true });
    let fileName = fileKey;
    try {
      const file = await client.file(fileKey, 1);
      fileName = file.name;
      opts.log(`Figma file: "${file.name}" (${(file.document.children ?? []).length} pages).`);
    } catch (err) {
      if (err instanceof FigmaHttpError && (err.status === 403 || err.status === 404)) {
        throw new Error(`The token cannot open file ${fileKey} (HTTP ${err.status}). Check the link and that the token's account can view the file.`);
      }
      throw err;
    }

    // 4. Variables source
    let variables = opts.variables;
    if (!variables) {
      try {
        await client.localVariables(fileKey);
        opts.log('Variables: readable through the Figma Variables API (Enterprise plan).');
      } catch {
        opts.log('Variables: the Variables API needs an Enterprise plan. Export them with the ds-sync Figma plugin (plugin/ in the ds-sync repo).');
        variables = (await ask('Path to the exported variables JSON (Enter to skip; values stay raw):', '')) || undefined;
      }
    }
    if (variables && !existsSync(resolve(cwd, variables))) throw new Error(`Variables file not found: ${variables}`);

    // 5. Stack -> output targets
    const stack = detectStack(cwd);
    if (stack.hasPackageJson) {
      opts.log(`Detected: ${stack.framework === 'unknown' ? 'no UI framework yet' : stack.framework}${stack.typescript ? ' + TypeScript' : ''}${stack.styling.length ? ` + ${stack.styling.join(', ')}` : ''}${stack.storybook ? `, Storybook ${stack.storybook}` : ''}, ${stack.packageManager}${stack.monorepo ? ', monorepo' : ''}.`);
    } else {
      opts.log('No package.json here: the Storybook will be generated as a standalone project.');
    }
    const suggested = suggestTargets(stack);
    if (!opts.target) opts.log(`Suggested output: ${suggested.join(' + ')} (${targetReason(stack)})`);
    const chosen = (opts.target ?? (await ask('Output: react, web-components or both?', suggested.length > 1 ? 'both' : suggested[0]))).trim().toLowerCase();
    const targets = chosen === 'both' ? (['react', 'web-components'] as const) : chosen === 'react' ? (['react'] as const) : chosen === 'web-components' || chosen === 'wc' ? (['web-components'] as const) : undefined;
    if (!targets) throw new Error(`Unknown output "${chosen}". Use react, web-components or both.`);
    if (opts.target) opts.log(`Output: ${targets.join(' + ')} (--target ${chosen}; for this project ds-sync would suggest ${suggested.join(' + ')})`);

    // 6. Output folder
    const dir = opts.dir ?? (await ask('Folder for the generated Storybook:', 'storybook'));
    const outAbs = resolve(cwd, dir);
    if (existsSync(outAbs) && readdirSync(outAbs).length && !existsSync(join(outAbs, 'GENERATION-REPORT.md'))) {
      throw new Error(`${dir} exists and was not generated by ds-sync. Choose another folder with --dir.`);
    }

    const slug = fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design-system';
    const config: Config = {
      figma: { fileKey },
      generate: {
        mode: 'auto',
        outDir: dir,
        targets: targets.map((t) => (t === 'react'
          ? { target: t, outDir: dir, packageName: `${slug}-storybook` }
          : { target: t, outDir: targets.length > 1 ? `${dir}-web-components` : dir, packageName: `${slug}-web-components` })),
        tagPrefix: 'ds',
        ...(variables ? { variablesExport: variables } : {}),
        overrides: {},
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    opts.log('Wrote ds-sync.config.json.');

    // 7. Optional CI workflow
    if (opts.ci || (interactive && /^y/i.test(await ask('Add a GitHub Actions workflow that regenerates on demand and opens a pull request? [y/N]', 'n')))) {
      const template = fileURLToPath(new URL('../templates/github-workflow.yml', import.meta.url));
      writeText(join(cwd, '.github', 'workflows', 'ds-sync.yml'), readFileSync(template, 'utf8'));
      opts.log('Wrote .github/workflows/ds-sync.yml (add a FIGMA_TOKEN repository secret).');
    }

    opts.log(`Next: npx ds-sync discover   (review what was found)\n      npx ds-sync generate   (writes ${targets.length > 1 ? `${dir}/ and ${dir}-web-components/` : `${dir}/`})\n      cd ${dir} && npm install && npm run storybook`);
  } finally {
    rl?.close();
  }
}
