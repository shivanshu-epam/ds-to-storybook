import { describe, expect, it } from 'vitest';

import { normalizeSvg, iconExportName } from '../src/generate/icons.ts';
import { generateStyles, type StyleModel } from '../src/generate/styles.ts';
import { docTabs } from '../src/generate/templates/common.ts';
import { modeRuns, vitestConfig } from '../src/generate/project.ts';
import { loadTokens, TokenResolver, tokensCss } from '../src/generate/tokens.ts';
import type { IRVariant } from '../src/ir/types.ts';

const tokens = loadTokens({
  variables: {
    'primitives.color': [['blue/600', 'C', { a: '#4f46e5', b: '#ff7a00' }, 'var(--color-blue-600)']],
    'primitives.dimension': [['size/4', 'F', 16, 'var(--size-4)']],
    'semantic.color': [
      ['interactive/bg/primary/default', 'C', { light: '@primitives.color:blue/600', dark: '@primitives.color:blue/600' }, 'var(--interactive-bg-primary-default)'],
      ['border/interactive/focus', 'C', { light: '@primitives.color:blue/600', dark: '@primitives.color:blue/600' }, 'var(--border-interactive-focus)'],
    ],
    'semantic.dimension': [
      ['space/inline/lg', 'F', '@primitives.dimension:size/4', 'var(--space-inline-lg)'],
      ['space/stack/lg', 'F', '@primitives.dimension:size/4', 'var(--space-stack-lg)'],
    ],
  },
});

describe('tokens', () => {
  it('writes the default mode to :root and other modes to attribute blocks', () => {
    const css = tokensCss(tokens, { 'semantic.color': 'data-theme', 'primitives.color': 'data-project' });
    expect(css).toContain('--color-blue-600: #4f46e5;');
    expect(css).toContain('--interactive-bg-primary-default: var(--color-blue-600);');
    expect(css).toContain('--space-inline-lg: var(--size-4);');
    expect(css).toContain('[data-project="b"] {\n  --color-blue-600: #ff7a00;');
    expect(css).toContain('[data-theme="dark"] {');
  });

  it('matches values to semantic tokens, guided by property hints over variant words', () => {
    const r = new TokenResolver(tokens);
    // Same value, different variables: the property hint decides.
    expect(r.css('#4f46e5', 'v:bg', ['bg', 'surface'], ['primary', 'default'])).toBe('var(--interactive-bg-primary-default)');
    expect(r.css('#4f46e5', 'v:ring', ['border', 'focus'], ['primary', 'default'])).toBe('var(--border-interactive-focus)');
    // Hint order: "inline" before "stack".
    expect(r.css('16px', 'v:pad', ['inline', 'space'])).toBe('var(--space-inline-lg)');
    // One Figma variable keeps its first token everywhere.
    expect(r.css('16px', 'v:pad', ['stack', 'space'])).toBe('var(--space-inline-lg)');
    // Raw in Figma stays raw; bound but unmatched stays raw and is reported.
    expect(r.css('#123456', null, ['bg'])).toBe('#123456');
    expect(r.css('#abcdef', 'v:x', ['bg'])).toBe('#abcdef');
    expect(r.decisions.map((d) => d.reason)).toEqual(expect.arrayContaining(['bound', 'raw-in-figma', 'no-matching-token']));
  });
});

function v(values: Record<string, string>, fill: string, padding: number): IRVariant {
  return {
    nodeId: Object.values(values).join('-'),
    name: Object.entries(values).map(([k, x]) => `${k}=${x}`).join(', '),
    values,
    style: { fills: [{ value: fill, variableId: null }], strokes: [], paddingLeft: { value: padding, variableId: null }, paddingRight: { value: padding, variableId: null } },
    parts: [],
  };
}

describe('generateStyles', () => {
  const variants: IRVariant[] = [];
  for (const variant of ['Primary', 'Secondary']) {
    for (const size of ['Sm', 'Md']) {
      for (const state of ['Default', 'Hover']) {
        const fill = variant === 'Primary' ? (state === 'Hover' ? '#111111' : '#222222') : '#eeeeee';
        variants.push(v({ Variant: variant, Size: size, State: state }, fill, size === 'Sm' ? 12 : 16));
      }
    }
  }
  const model: StyleModel = {
    axes: [
      { figma: 'Variant', attr: 'variant', values: { Primary: 'primary', Secondary: 'secondary' } },
      { figma: 'Size', attr: 'size', values: { Sm: 'sm', Md: 'md' } },
    ],
    stateAxes: [{ figma: 'State', states: { Default: null, Hover: { target: 'root', selector: ':hover' } } }],
    roles: [{ role: 'root', kind: 'box', find: (x) => ({ style: x.style }) }],
  };
  const out = generateStyles(variants, model, new TokenResolver(tokens));

  it('finds the smallest set of axes each property depends on', () => {
    expect(out.dependencies['root.background']).toEqual(['Variant', 'State']);
    expect(out.dependencies['root.padding']).toEqual(['Size']);
    expect(out.dependencies['root.opacity']).toEqual([]);
  });

  it('emits one rule per combination and skips states equal to their base', () => {
    expect(out.css).toContain('.root:where([data-size="sm"]) {\n  padding: 0 12px 0 12px;\n}');
    expect(out.css).toContain('.root:where([data-variant="primary"]:hover) {\n  background: #111111;\n}');
    // Secondary hover equals secondary default: inherited, not emitted.
    expect(out.css).not.toContain('.root:where([data-variant="secondary"]:hover)');
  });
});

describe('icons and docs', () => {
  it('names icons and makes SVGs currentColor and inert', () => {
    expect(iconExportName('Icon/nav/chevron-down/20')).toBe('navChevronDown20');
    const svg = normalizeSvg('<svg width="20" height="20" viewBox="0 0 20 20" onload="x()"><path fill="#111827" stroke="none"/><script>bad()</script></svg>');
    expect(svg).toBe('<svg width="100%" height="100%" aria-hidden="true" focusable="false" viewBox="0 0 20 20"><path fill="currentColor" stroke="none"/></svg>');
  });

  it('structures doc frames by font size and drops Figma-only sections', () => {
    const tabs = docTabs(
      [{ nodeId: '1:1', name: 'Documentation / Usage', blocks: [
        { nodeId: 'a', text: 'Button', fontSize: 36 },
        { nodeId: 'b', text: 'Usage', fontSize: 14 },
        { nodeId: 'c', text: 'Live demo', fontSize: 24 },
        { nodeId: 'd', text: 'No Storybook is linked yet.', fontSize: 12 },
        { nodeId: 'e', text: 'Overview', fontSize: 24 },
        { nodeId: 'f', text: 'A button triggers an action.', fontSize: 14 },
      ] }],
      'Button',
    );
    expect(tabs).toEqual([{ title: 'Usage', nodeId: '1:1', sections: [{ heading: 'Overview', level: 3, paragraphs: ['A button triggers an action.'] }] }]);
  });
});

describe('one odd variant', () => {
  it('becomes a single override rule instead of multiplying every rule', () => {
    const variants: IRVariant[] = [];
    for (const variant of ['Primary', 'Danger']) {
      for (const size of ['Sm', 'Md', 'Lg']) {
        for (const state of ['Default', 'Hover']) {
          let fill = variant === 'Primary' ? '#222222' : '#cc0000';
          if (state === 'Hover') fill = variant === 'Primary' ? '#111111' : '#990000';
          // The designer recoloured one combination.
          if (variant === 'Danger' && size === 'Md' && state === 'Default') fill = '#00cc66';
          variants.push(v({ Variant: variant, Size: size, State: state }, fill, 16));
        }
      }
    }
    const model: StyleModel = {
      axes: [
        { figma: 'Variant', attr: 'variant', values: { Primary: 'primary', Danger: 'danger' } },
        { figma: 'Size', attr: 'size', values: { Sm: 'sm', Md: 'md', Lg: 'lg' } },
      ],
      stateAxes: [{ figma: 'State', states: { Default: null, Hover: { target: 'root', selector: ':hover' } } }],
      roles: [{ role: 'root', kind: 'box', find: (x) => ({ style: x.style }) }],
    };
    const out = generateStyles(variants, model, new TokenResolver(tokens));
    expect(out.dependencies['root.background']).toEqual(['Variant', 'State', '+1 variant override']);
    const rules = out.css.split('\n\n').filter((r) => r.includes('background'));
    expect(rules).toHaveLength(5); // 2 variants × 2 states (hover for danger and primary) + 1 override
    // Order: base, then the override, then hover (which must still win on the overridden combination).
    const order = rules.map((r) => r.split(' {')[0]);
    expect(order.indexOf('.root:where([data-variant="danger"][data-size="md"])')).toBeGreaterThan(order.indexOf('.root:where([data-variant="danger"])'));
    expect(order.indexOf('.root:where([data-variant="danger"]:hover)')).toBeGreaterThan(order.indexOf('.root:where([data-variant="danger"][data-size="md"])'));
  });
});

describe('mode test runs', () => {
  const toolbars = [{ key: 'theme', modes: ['light', 'dark'] }, { key: 'project', modes: ['project-a', 'project-b'] }];
  it('runs the defaults once, then every other mode once', () => {
    expect(modeRuns(toolbars).map((r) => r.name)).toEqual(['storybook', 'storybook (theme: dark)', 'storybook (project: project-b)']);
  });
  it('passes the mode to the preview through VITE_DS_MODES', () => {
    const config = vitestConfig(toolbars);
    expect(config).toContain('run("storybook (theme: dark)", {"theme":"dark"}),');
    expect(config).toContain("'import.meta.env.VITE_DS_MODES'");
    expect(config).toContain('(defaults, theme=dark, project=project-b)');
  });
});

describe('known issues per mode', () => {
  const stories = "import type { Meta, StoryObj } from '@storybook/react-vite';\n\nconst meta = {\n  parameters: { figma: {} },\n};\n";
  it('accepts an issue only in the listed modes', async () => {
    const { acceptKnownIssue, parseModeKey } = await import('../src/generate/index.ts');
    expect(parseModeKey('theme=dark project=b')).toEqual({ theme: 'dark', project: 'b' });
    expect(parseModeKey('default')).toEqual({});
    const out = acceptKnownIssue(stories, { 'theme=dark': 'low contrast' });
    expect(out).toContain("import { inModes } from '../../storybook/modes';");
    expect(out).toContain(`a11y: { test: inModes({"theme":"dark"}) ? 'todo' : 'error' },\n    figma: {}`);
    expect(acceptKnownIssue(stories, 'always')).toContain("a11y: { test: 'todo' },");
  });
});
