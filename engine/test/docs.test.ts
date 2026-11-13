import { describe, expect, it } from 'vitest';

import { docsPage, isBuildingBlock, plainLabel, polishStories, templateSections } from '../src/generate/docs.ts';
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
});
