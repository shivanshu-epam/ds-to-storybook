import { describe, expect, it } from 'vitest';

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lintDocs } from '../src/docs/lint.ts';
import { codeExample, docsPage, isBuildingBlock, plainLabel, polishStories, templateSections } from '../src/generate/docs.ts';
import type { IRComponentSet } from '../src/ir/types.ts';

describe('documentation standard (fidelity step 6)', () => {
  it('turns Figma and export names into plain labels', () => {
    expect(plainLabel('IsDisabledAndState')).toBe('Disabled and state');
    expect(plainLabel('contentType and state')).toBe('Content type and state');
    expect(plainLabel('ShowFooter')).toBe('With footer');
    expect(plainLabel('Options')).toBe('Optional parts');
    expect(plainLabel('isDestructive')).toBe('Destructive');
  });

  it('recognises Figma building blocks', () => {
    expect(isBuildingBlock('_Accordion Item')).toBe(true);
    expect(isBuildingBlock('.Leading')).toBe(true);
    expect(isBuildingBlock('_Table/ Cell-Base')).toBe(true);
    expect(isBuildingBlock('CheckboxBase')).toBe(true);
    expect(isBuildingBlock('Accordion')).toBe(false);
    expect(isBuildingBlock('Database')).toBe(false);
  });

  const stories = `import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip, type ChipProps } from './Chip';

const meta = {
  title: 'Components/Chip',
} satisfies Meta<typeof Chip>;

// Keep the type import used even when no lookup tables are generated.
export type { ChipProps };

export const Default: Story = {
  args: {},
};

export const IsDisabled: Story = {
  render: () => <Chip />,
};

export const DisabledDoesNotToggle: Story = {
  play: async () => {},
};

export const FigmaVariants: Story = {
  tags: ['!test', '!autodocs'],
  render: () => <Chip />,
};
`;

  it('names stories in plain language, hides test-only stories, drops the stray type export', () => {
    const s = polishStories(stories, { name: 'Chip', documented: new Set(['IsDisabled']), buildingBlock: false });
    expect(s).not.toContain('export type { ChipProps }');
    expect(s).toContain("import { Chip } from './Chip';");
    expect(s).toMatch(/export const IsDisabled: Story = \{\n  name: "Disabled",/);
    expect(s).toMatch(/export const DisabledDoesNotToggle: Story = \{\n  name: "Disabled does not toggle",\n  tags: \['!dev'\],/);
    expect(s).toMatch(/FigmaVariants: Story = \{\n  name: "Figma variants",\n  tags: \['!dev', '!test', '!autodocs'\],/);
    expect(s).not.toMatch(/IsDisabled: Story = \{\n  name: "Disabled",\n  tags/);
  });

  it('keeps building blocks out of the sidebar', () => {
    expect(polishStories(stories, { name: 'Chip', documented: new Set(), buildingBlock: true })).toContain("const meta = {\n  tags: ['!dev'],\n");
  });

  it('writes the tiered page with plain headings, grouped properties and composition', () => {
    const template = "## isDisabled\n\n<Canvas of={Stories.IsDisabled} />\n\n## Options\n\nShown one at a time.\n\n<Canvas of={Stories.Options} />";
    expect(templateSections(template).map((x) => x.story)).toEqual(['IsDisabled', 'Options']);
    const set = { name: 'Accordion', nodeId: '1:2', description: '', docFrames: [], variants: [{}, {}, {}] } as unknown as IRComponentSet;
    const page = docsPage({
      name: 'Accordion', title: 'Components/Accordion', framework: 'react', tier: 3, sets: [set], fileKey: 'F', version: '9',
      report: { name: 'Accordion', figmaSets: [], files: [], props: [{ prop: 'leading', figma: 'leading (variant)' }, { prop: 'showLeading', figma: 'showLeading (boolean)' }], assumptions: [], gaps: [], dependencies: {}, nested: { layers: 1, checked: 6, matched: 6, stateVariants: 0, mismatches: [] } },
      composition: [{ component: 'AccordionItem', title: 'Components/AccordionItem', buildingBlock: true, layer: 'Item', count: 5, driven: [{ prop: 'showLeading', from: ['leading'] }], fixed: [] }],
      exposed: [], templateMdx: template, buildingBlock: false, usedIn: [], knownIssues: [], modes: ['light', 'dark'], packageName: 'pkg',
    });
    expect(page).toContain('<strong>No description in Figma.</strong>');
    expect(page).toContain('### Disabled');
    expect(page).toContain('### Optional parts');
    expect(page).toContain('### Appearance');
    expect(page).toContain('### Content');
    expect(page).toContain('## Composition');
    expect(page).toContain('showLeading: follows leading');
    expect(page).toContain('Nested consistency: 6/6');
    expect(page).toContain('(light, dark)');
    expect(page).not.toMatch(/^## isDisabled/m);
    expect(page).toContain('<Meta of={Stories} />');
  });
  it('writes a working code example from the Figma defaults, valid JSX whatever the text', () => {
    expect(codeExample('Input', [{ prop: 'label', figma: 'label (text)', default: "'Label'" }, { prop: 'helperText', figma: 'helper (text)', default: "'We\\'ll never share this.'" }]))
      .toBe(`<Input label="Label" helperText="We'll never share this." />`);
    expect(codeExample('Quote', [{ prop: 'text', figma: 'text (text)', default: `'Say "hi"'` }])).toBe(`<Quote text={"Say \\"hi\\""} />`);
    expect(codeExample('Badge', [{ prop: 'size', figma: 'Size (variant)', default: "'md'" }])).toBe('<Badge size="md" />');
    expect(codeExample('Button', [{ prop: 'children', figma: 'Show label (boolean) + label text' }])).toBe('<Button>Label</Button>');
  });

  it('lints a generated page against the standard', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'ds-lint-')), 'src', 'components', 'Chip');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Chip.tsx'), 'export interface ChipProps {\n  /** x */\n  size?: string;\n  tone?: string;\n}\n');
    writeFileSync(join(dir, 'Chip.stories.tsx'), "const meta = { title: 'Components/Chip' };");
    writeFileSync(join(dir, 'Chip.mdx'), ['## Overview', '', '<p><strong>No description in Figma.</strong></p>', '## Preview', '', 'x', '## Variants', '',
      '## Properties', '', '### Appearance', '', '<table><thead><tr><th scope="col">Property</th><th scope="col">Code</th><th scope="col">Notes</th></tr></thead><tbody><tr><td>{"Size"}</td><td><code>{"size"}</code></td><td>{""}</td></tr></tbody></table>',
      '## Accessibility', '', 'x', '## Code', '', '<Source code={"<Chip />"} />', '## Design reference', '', '<p>Visual check: not run</p>', '<a href="./?path=/docs/components-nope--docs">x</a>'].join('\n'));
    const rules = lintDocs(join(dir, '..', '..', '..')).findings.map((f) => `${f.severity}:${f.rule}`);
    expect(rules).toEqual(expect.arrayContaining(['error:empty-section', 'warning:no-description', 'error:props-columns', 'warning:prop-missing', 'warning:prop-undescribed', 'warning:code-example', 'error:figma-link', 'warning:visual-not-run', 'error:broken-link']));
  });
});
