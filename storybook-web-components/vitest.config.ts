import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Every story is a test: it must render, its play function must pass, and axe must find no violations.
// Stories run once per Figma mode (defaults, project=project-b, theme=dark), so contrast is checked in every theme.
// Run one mode: npx vitest run --project "storybook (theme: dark)"
const run = (name: string, modes: Record<string, string>) => ({
  extends: true,
  plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
  define: { 'import.meta.env.VITE_DS_MODES': JSON.stringify(JSON.stringify(modes)) },
  test: {
    name,
    browser: { enabled: true, headless: true, provider: playwright({}), instances: [{ browser: 'chromium' as const }] },
  },
});

export default defineConfig({
  test: {
    projects: [
      run("storybook", {}),
      run("storybook (project: project-b)", {"project":"project-b"}),
      run("storybook (theme: dark)", {"theme":"dark"}),
    ],
  },
});
