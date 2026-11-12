# Figma to Storybook (proof of concept)

Turns a Figma design system into a working, tested Storybook, and reports where existing code has drifted from Figma.

| Folder | What it is |
| --- | --- |
| [`engine/`](engine/) | The `ds-sync` engine (TypeScript). Reads Figma through the REST API, builds a normalized IR and component specs, and either **generates a Storybook project** or writes a **drift report** against an existing repo. |
| [`storybook/`](storybook/) | A Storybook project **generated entirely from Figma** by the engine: tokens, React components, stories with interaction tests, and MDX docs built from the Figma documentation frames. |
| `*-story-skill.md`, `skill.md` | The earlier hand-written agent skills for the same components, kept as the reference the engine is checked against. |

## Generate the Storybook from Figma

```bash
cd engine
npm install
cp .env.example .env                 # add a Figma personal access token (file_content:read)
npm run ds-sync -- extract           # Figma → engine/out/figma-ir.json
npm run ds-sync -- generate          # IR → ../storybook

cd ../storybook
npm install
npm run storybook                    # http://localhost:6006
npm test                             # every story: render, interactions, axe accessibility
```

## What the generator does

1. **Tokens.** Every Figma variable becomes a CSS custom property. Modes become attributes: `data-theme` (light/dark) and `data-project` (brand).
2. **Styles.** For each layer and CSS property, the engine finds the smallest set of Figma axes the value depends on (for example, background depends on Variant and State; padding only on Size). It emits one rule per combination, using semantic tokens matched from the Figma bindings.
3. **Components.** Archetype templates (action, checkbox, disclosure) give the behaviour Figma cannot express: the WAI-ARIA button, checkbox and accordion patterns.
4. **Stories.** These are generated from the Figma axes:
   - a Default story;
   - a variant × state matrix (pseudo states forced with `data-force-state`);
   - one story per axis;
   - slot stories;
   - play-function tests for clicks and keyboard.
5. **Docs.** An MDX page per component, with the Figma documentation text kept verbatim and a Figma-to-prop table.
6. **Report.** `storybook/GENERATION-REPORT.md` and `token-map.json` record what came from Figma, what came from archetype defaults, and every token decision.

Current scope: Button, Checkbox (with CheckboxGroup) and Accordion, from the Figma file `I983NcgqSiY14YkpJbwjG8`.
