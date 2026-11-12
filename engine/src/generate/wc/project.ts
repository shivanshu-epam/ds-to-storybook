/** Static files for a Web Components (Lit) Storybook project. Works in any framework. */
import type { IconAsset } from '../icons.ts';
import type { GeneratedFile } from '../templates/common.ts';

export const WC_VERSIONS = {
  lit: '3.3.1',
  '@fontsource-variable/inter': '5.3.0',
  storybook: '10.6.3',
  '@storybook/web-components-vite': '10.6.3',
  '@storybook/addon-docs': '10.6.3',
  '@storybook/addon-a11y': '10.6.3',
  '@storybook/addon-vitest': '10.6.3',
  vite: '8.3.5',
  vitest: '5.0.5',
  '@vitest/browser': '5.0.5',
  '@vitest/browser-playwright': '5.0.5',
  playwright: '1.64.1',
  typescript: '5.9.3',
  '@types/node': '24.10.1',
} as const;

export interface WcProjectOptions {
  name: string;
  figma: { fileKey: string; fileName: string };
  modes: Record<string, string[]>;
  modeAttributes: Record<string, string>;
  /** Component name -> tag + module path. */
  components: { name: string; tags: string[]; module: string }[];
  icons: IconAsset[];
  colorTokens: { name: string; cssVar: string }[];
  page?: { background?: string; text?: string };
  /** Per tag: prop -> TS type, for the React JSX typings. */
  typings: { tag: string; className: string; props: { name: string; type: string }[] }[];
}

const j = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export function wcProjectFiles(o: WcProjectOptions): GeneratedFile[] {
  const v = WC_VERSIONS;
  const deps = { lit: v.lit, '@fontsource-variable/inter': v['@fontsource-variable/inter'] };
  const devDeps = Object.fromEntries(Object.entries(v).filter(([k]) => !(k in deps)));
  const toolbars = Object.entries(o.modes)
    .filter(([c]) => o.modeAttributes[c])
    .map(([collection, modes]) => ({ key: o.modeAttributes[collection]!.replace(/^data-/, ''), collection, modes }));

  return [
    {
      path: 'package.json',
      content: j({
        name: o.name,
        version: '0.1.0',
        private: true,
        type: 'module',
        description: `Web Components (Lit) generated from the Figma file "${o.figma.fileName}" (${o.figma.fileKey}) by ds-sync. Usable from any framework.`,
        main: 'src/index.ts',
        exports: { '.': './src/index.ts', './tokens.css': './src/tokens/tokens.css', './tokens.json': './src/tokens/tokens.json' },
        scripts: { storybook: 'storybook dev -p 6007', 'build-storybook': 'storybook build', typecheck: 'tsc --noEmit', test: 'vitest run' },
        dependencies: deps,
        devDependencies: devDeps,
      }),
    },
    {
      path: 'tsconfig.json',
      content: j({
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          noEmit: true,
          isolatedModules: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          useDefineForClassFields: false,
          types: ['vite/client', 'node'],
        },
        include: ['src', '.storybook', 'vitest.config.ts'],
      }),
    },
    { path: '.gitignore', content: 'node_modules/\nstorybook-static/\n*.log\n' },
    {
      path: '.storybook/main.ts',
      content: `import type { StorybookConfig } from '@storybook/web-components-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: '@storybook/web-components-vite',
};

export default config;
`,
    },
    {
      path: '.storybook/preview.ts',
      content: `import type { Decorator, Preview } from '@storybook/web-components-vite';

import '../src/styles/base.css';
import '../src/index';

// Figma variable modes are applied as attributes on <html>; tokens are CSS custom properties, which cross Shadow DOM.
const withModes: Decorator = (story, { globals }) => {
  const html = document.documentElement;
${toolbars.map((t) => `  html.setAttribute('data-${t.key}', String(globals.${camel(t.key)} ?? '${t.modes[0]}'));`).join('\n')}
  return story();
};

const preview: Preview = {
  decorators: [withModes],
  globalTypes: {
${toolbars.map((t) => `    ${camel(t.key)}: {
      description: 'Figma mode: ${t.collection}',
      toolbar: { title: '${t.key}', icon: 'paintbrush', items: [${t.modes.map((m) => `'${m}'`).join(', ')}], dynamicTitle: true },
    },`).join('\n')}
  },
  initialGlobals: { ${toolbars.map((t) => `${camel(t.key)}: '${t.modes[0]}'`).join(', ')} },
  parameters: {
    controls: { expanded: true },
    // Accessibility violations fail the story tests (axe checks inside Shadow DOM).
    a11y: { test: 'error' },
  },
};

export default preview;
`,
    },
    {
      path: 'vitest.config.ts',
      content: `import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Every story is a test: it must render, its play function must pass, and axe must find no violations.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
        test: {
          name: 'storybook',
          browser: { enabled: true, headless: true, provider: playwright({}), instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
});
`,
    },
    {
      path: 'src/styles/base.css',
      content: `@import '@fontsource-variable/inter';
@import '../tokens/tokens.css';

body {
  margin: 0;
  font-family: "Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
${o.page?.background ? `  background: var(${o.page.background});\n` : ''}${o.page?.text ? `  color: var(${o.page.text});\n` : ''}}
`,
    },
    {
      path: 'src/icons/icons.ts',
      content: `// Generated by ds-sync: SVG exports of the Figma icon components the generated components use.
// Colours are replaced with currentColor, so CSS \`color\` drives them.
export const icons = {
${o.icons.map((i) => `  /** Figma: ${i.figmaName} (${i.nodeId}) */\n  ${i.name}: ${JSON.stringify(i.svg)},`).join('\n')}
} as const;

export type IconName = keyof typeof icons;
`,
    },
    {
      path: 'src/icons/icon.ts',
      content: `import { html } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

import { icons, type IconName } from './icons';

/** A Figma icon that fills its parent box and takes the parent's text colour. Decorative. */
export function icon(name: string) {
  const svg = icons[name as IconName];
  return svg ? html\`<span aria-hidden="true" style="display:inline-flex;width:100%;height:100%">\${unsafeSVG(svg)}</span>\` : html\`\`;
}
`,
    },
    {
      path: 'src/storybook/layout.ts',
      content: `import { html, type TemplateResult } from 'lit';

const caption = 'font: 12px/16px system-ui, sans-serif; opacity: .8;';

/** A labelled grid for variant × state stories. Scrollable and keyboard-focusable when wider than the canvas. */
export function matrix(label: string, rows: string[], columns: string[], cell: (row: string, column: string) => TemplateResult) {
  return html\`<div role="region" aria-label=\${label} tabindex="0" style="overflow-x:auto;max-width:100%">
    <table style="border-collapse:separate;border-spacing:16px">
      <thead><tr><th scope="col" style=\${caption}><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Row</span></th>
        \${columns.map((c) => html\`<th scope="col" style="\${caption};text-align:left">\${c}</th>\`)}</tr></thead>
      <tbody>\${rows.map((r) => html\`<tr><th scope="row" style="\${caption};text-align:left;white-space:nowrap">\${r}</th>\${columns.map((c) => html\`<td>\${cell(r, c)}</td>\`)}</tr>\`)}</tbody>
    </table>
  </div>\`;
}

export const row = (items: TemplateResult[]) => html\`<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:24px">\${items}</div>\`;
export const stack = (items: TemplateResult[]) => html\`<div style="display:flex;flex-direction:column;align-items:stretch;gap:24px">\${items}</div>\`;
export const labelled = (label: string, content: TemplateResult) =>
  html\`<div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px"><span style=\${caption}>\${label}</span>\${content}</div>\`;

/** Queries inside a component's Shadow DOM (testing-library does not cross shadow roots). */
export function shadowOf(root: Element, selector: string): ShadowRoot {
  const host = root.querySelector(selector);
  if (!host?.shadowRoot) throw new Error(\`\${selector} has no shadow root\`);
  return host.shadowRoot;
}
`,
    },
    {
      path: 'src/foundations/Colors.stories.ts',
      content: `import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';

/** Semantic colour tokens from the Figma variables (switch modes in the toolbar). */
const TOKENS: { name: string; cssVar: string }[] = ${JSON.stringify(o.colorTokens, null, 2)};

const meta = { title: 'Foundations/Colors', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;

export const Semantic: StoryObj = {
  render: () => html\`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
    \${TOKENS.map((t) => html\`<div style="display:flex;align-items:center;gap:8px;font:12px system-ui,sans-serif">
      <span style="width:32px;height:32px;flex:none;border-radius:6px;background:var(\${t.cssVar});box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)"></span>
      <span><strong>\${t.name}</strong><br /><code>\${t.cssVar}</code></span></div>\`)}
  </div>\`,
};
`,
    },
    {
      path: 'src/index.ts',
      content: `// Importing this module registers every custom element.
${o.components.map((c) => `export * from './components/${c.name}/${c.module}';`).join('\n')}
export { icons, type IconName } from './icons/icons';
export { tokens, type TokenName } from './tokens/tokens';
`,
    },
    {
      path: 'types/react.d.ts',
      content: `// JSX typings for React 19+, which passes props to custom elements as properties.
// Add this file to your React app's tsconfig "include" (or copy it into your project).
import type * as React from 'react';
${o.typings.map((t) => `import type { ${t.className} } from '../src/index';`).join('\n')}

type El<T, P> = React.DetailedHTMLProps<React.HTMLAttributes<T>, T> & P;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
${o.typings.map((t) => `      '${t.tag}': El<${t.className}, { ${t.props.map((p) => `${p.name}?: ${p.type}`).join('; ')} }>;`).join('\n')}
    }
  }
}
`,
    },
  ];
}
