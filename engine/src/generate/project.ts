/** Static files for a fresh Storybook project (no existing code or Storybook assumed). */
import type { IconAsset } from './icons.ts';
import type { GeneratedFile } from './templates/common.ts';

/** Versions known to work together (taken from a working Storybook 10 repo). */
export const VERSIONS = {
  react: '19.3.1',
  'react-dom': '19.3.1',
  storybook: '10.6.3',
  '@storybook/react-vite': '10.6.3',
  '@storybook/addon-docs': '10.6.3',
  '@storybook/addon-a11y': '10.6.3',
  '@storybook/addon-vitest': '10.6.3',
  vite: '8.3.5',
  vitest: '5.0.5',
  '@vitest/browser': '5.0.5',
  '@vitest/browser-playwright': '5.0.5',
  playwright: '1.64.1',
  typescript: '5.9.3',
  '@types/react': '19.3.0',
  '@types/react-dom': '19.3.0',
  '@types/node': '24.10.1',
  '@fontsource-variable/inter': '5.3.0',
} as const;

export interface ProjectOptions {
  name: string;
  figma: { fileKey: string; fileName: string; version: string };
  modes: Record<string, string[]>;
  modeAttributes: Record<string, string>;
  components: string[];
  icons: IconAsset[];
  colorTokens: { name: string; cssVar: string }[];
  /** Page background and text tokens, when the variables have them (so mode switches restyle the canvas). */
  page?: { background?: string; text?: string };
}

const j = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

export function projectFiles(o: ProjectOptions): GeneratedFile[] {
  const v = VERSIONS;
  const deps = { react: v.react, 'react-dom': v['react-dom'], '@fontsource-variable/inter': v['@fontsource-variable/inter'] };
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
        description: `Storybook generated from the Figma file "${o.figma.fileName}" (${o.figma.fileKey}) by ds-sync.`,
        scripts: {
          storybook: 'storybook dev -p 6006',
          'build-storybook': 'storybook build',
          typecheck: 'tsc --noEmit',
          test: 'vitest run',
        },
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
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          isolatedModules: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          types: ['vite/client', 'node'],
        },
        include: ['src', '.storybook', 'vitest.config.ts'],
      }),
    },
    { path: '.gitignore', content: 'node_modules/\nstorybook-static/\n*.log\n' },
    {
      path: '.storybook/main.ts',
      content: `import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: '@storybook/react-vite',
};

export default config;
`,
    },
    {
      path: '.storybook/preview.tsx',
      content: `import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';

import '../src/styles/base.css';

// Figma variable modes are applied as attributes on <html>, so every token resolves in the chosen mode.
const withModes: Decorator = (Story, { globals }) => {
  useEffect(() => {
    const html = document.documentElement;
${toolbars.map((t) => `    html.setAttribute('data-${t.key}', String(globals.${camel(t.key)} ?? '${t.modes[0]}'));`).join('\n')}
  }, [${toolbars.map((t) => `globals.${camel(t.key)}`).join(', ')}]);
  return <Story />;
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
    // Accessibility violations fail the story tests.
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
${o.page?.background ? `  background: var(${o.page.background});
` : ''}${o.page?.text ? `  color: var(${o.page.text});
` : ''}}
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
      path: 'src/icons/Icon.tsx',
      content: `import { icons, type IconName } from './icons';

/** A Figma icon. It fills its parent box and takes the parent's text colour. Decorative by default. */
export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: 'inline-flex', width: '100%', height: '100%' }}
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
`,
    },
    {
      path: 'src/storybook/layout.tsx',
      content: `import type { CSSProperties, ReactNode } from 'react';

const caption: CSSProperties = { fontSize: 12, lineHeight: '16px', color: 'inherit', opacity: 0.8, fontFamily: 'system-ui, sans-serif' };

/** A labelled grid for variant × state stories. Scrollable and keyboard-focusable when wider than the canvas. */
export function Matrix({ label, rows, columns, cell }: { label: string; rows: string[]; columns: string[]; cell: (row: string, column: string) => ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 16 }}>
        <thead>
          <tr>
            <th scope="col" style={caption}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Row</span></th>
            {columns.map((c) => <th key={c} scope="col" style={{ ...caption, textAlign: 'left' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" style={{ ...caption, textAlign: 'left', whiteSpace: 'nowrap' }}>{r}</th>
              {columns.map((c) => <td key={c}>{cell(r, c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 24 }}>{children}</div>;
}

export function Stack({ children }: { children: ReactNode }) {
  // Children stretch to the story width (e.g. an accordion fills its Figma width); their own content keeps its alignment.
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 24 }}>{children}</div>;
}

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      <span style={caption}>{label}</span>
      {children}
    </div>
  );
}
`,
    },
    {
      path: 'src/storybook/FigmaDocs.tsx',
      content: `interface DocSection { heading?: string; level: 3 | 4; paragraphs: string[] }
interface DocTab { title: string; nodeId: string; sections: DocSection[] }
interface Docs {
  component: string;
  figma: { fileKey: string; version: string; sets: { name: string; nodeId: string }[] };
  mapping: { prop: string; figma: string; note?: string }[];
  tabs: DocTab[];
}

const link = (fileKey: string, nodeId: string) => \`https://www.figma.com/design/\${fileKey}?node-id=\${nodeId.replace(':', '-')}\`;

/** Renders the component's Figma documentation frames verbatim, plus the Figma-to-code mapping. */
export function FigmaDocs({ docs }: { docs: Docs }) {
  return (
    <div>
      <h2>Figma to code</h2>
      <table>
        <thead><tr><th scope="col">Figma</th><th scope="col">Prop</th><th scope="col">Note</th></tr></thead>
        <tbody>
          {docs.mapping.map((m) => (
            <tr key={m.figma + m.prop}><td>{m.figma}</td><td><code>{m.prop}</code></td><td>{m.note ?? ''}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        Source: {docs.figma.sets.map((s, i) => (
          <span key={s.nodeId}>{i > 0 ? ', ' : ''}<a href={link(docs.figma.fileKey, s.nodeId)}>{s.name}</a></span>
        ))} (Figma version {docs.figma.version}).
      </p>
      {docs.tabs.map((tab) => (
        <section key={tab.nodeId}>
          <h2>{tab.title}</h2>
          {tab.sections.map((s, i) => (
            <div key={i}>
              {s.heading && (s.level === 3 ? <h3>{s.heading}</h3> : <h4>{s.heading}</h4>)}
              {s.paragraphs.map((p, k) => <p key={k} style={{ whiteSpace: 'pre-line' }}>{p}</p>)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
`,
    },
    {
      path: 'src/foundations/Colors.stories.tsx',
      content: `import type { Meta, StoryObj } from '@storybook/react-vite';

/** Semantic colour tokens from the Figma variables (switch modes in the toolbar). */
const TOKENS: { name: string; cssVar: string }[] = ${JSON.stringify(o.colorTokens, null, 2)};

const meta = { title: 'Foundations/Colors', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;

export const Semantic: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {TOKENS.map((t) => (
        <div key={t.cssVar} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
          <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 6, background: \`var(\${t.cssVar})\`, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }} />
          <span><strong>{t.name}</strong><br /><code>{t.cssVar}</code></span>
        </div>
      ))}
    </div>
  ),
};
`,
    },
    {
      path: 'src/index.ts',
      content: `${o.components.map((c) => `export * from './components/${c}/${c}';`).join('\n')}
export { Icon } from './icons/Icon';
export type { IconName } from './icons/icons';
`,
    },
  ];
}

function camel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
