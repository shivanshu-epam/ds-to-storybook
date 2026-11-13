import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';

import '../src/styles/base.css';

// Set by vitest.config.ts: the story tests run once per Figma mode.
const TEST_MODES: Record<string, string> = JSON.parse(import.meta.env.VITE_DS_MODES ?? '{}');

// Figma variable modes are applied as attributes on <html>, so every token resolves in the chosen mode.
const withModes: Decorator = (Story, { globals }) => {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-project', String(globals.project ?? 'project-a'));
    html.setAttribute('data-theme', String(globals.theme ?? 'light'));
  }, [globals.project, globals.theme]);
  return <Story />;
};

const preview: Preview = {
  decorators: [withModes],
  globalTypes: {
    project: {
      description: 'Figma mode: primitives.color',
      toolbar: { title: 'project', icon: 'paintbrush', items: ['project-a', 'project-b'], dynamicTitle: true },
    },
    theme: {
      description: 'Figma mode: semantic.color',
      toolbar: { title: 'theme', icon: 'paintbrush', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { project: TEST_MODES['project'] ?? 'project-a', theme: TEST_MODES['theme'] ?? 'light' },
  parameters: {
    controls: { expanded: true },
    // Accessibility violations fail the story tests.
    a11y: { test: 'error' },
  },
};

export default preview;
