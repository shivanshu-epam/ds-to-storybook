# Changelog

All notable changes to ds-sync. The CLI (npm package `ds-sync`) and the Claude Code plugin (`ds-sync@ds-sync`) are released together under one version.

## 0.2.0

The first public release. Version 0.1.0 was never published.

### Read Figma without API limits

- The ds-sync Figma plugin saves `figma-export.zip`: the file as the REST API returns it, with styles, variables (on any plan) and renders. ds-sync reads it instead of the API (`figma.export` in the config; `--source api|export`). There are no API limits, and no token is needed. The GitHub workflow runs when a new export is committed.
- Tested on a third design system, Carbon v11, read only through the plugin export. The fixes it led to: tokens bound by variable id, CSS-safe variable names, reserved JavaScript and element names, unique icon names, valid Storybook toolbar keys, and per-mode story tests only for collections that hold colours.
- When Figma's API asks for a long wait (its allowance is used up), ds-sync stops at once with an explanation instead of waiting for days.

### Generate

- Discovers every component set in a Figma file, including nested ones, and classifies frames as documentation, examples or other.
- Generates native React (TypeScript, CSS Modules) or Lit Web Components for any framework, or both from one run, with the same CSS.
- Design tokens from Figma variables: CSS custom properties with modes as attributes, W3C DTCG JSON and TypeScript. Without the Variables API (non-Enterprise plans), the ds-sync Figma plugin exports them.
- Behaviour from structure, tested with WAI-ARIA patterns: button, link, checkbox, switch, radio and radio group, disclosure, tabs, listbox, menu, menu button, select-only combobox, dialog and input.
- Nested components: exposed nested properties become the parent's API, per-variant values are checked against Figma, and repeated children become a `children` API.
- Content slots from instance swaps. A boolean that only shows a slot is merged into it: pass content to show it, `null` to hide it.
- Fonts from npm (Fontsource), or the team's own font files (`generate.fonts.<family>.files`), copied into the project with `@font-face` rules.
- Foundations pages (colours, typography, spacing, radius, sizing, borders, elevation, motion, opacity) from variables, or from the file's colour, text and effect styles.

### Check

- Every story renders and runs its interactions, and axe finds no violations, in every Figma mode. Known design issues are accepted per mode in the configuration.
- `ds-sync visual` compares every Figma variant with the Storybook, pixel by pixel. `--only` updates some components and keeps the others.
- `ds-sync audit` scores each component per fidelity measure, with no overall score that could hide a failure.
- `ds-sync docs lint` checks every docs page against the documentation standard (sections, properties table, plain labels, code example, Figma links).

### Interpret (optional, with Claude Code)

- `ds-sync review` writes one evidence file per component. `ds-sync interpret` runs the plugin's `interpret-component` skill headless and proposes code names, descriptions and behaviour as decisions in `ds-sync.decisions.json`. A person accepts them with `ds-sync decisions accept`; nothing is applied until then.
- The AI sees how the rest of the design system names the same concept, and keeps names consistent across components. Re-running proposes revisions to accepted decisions; it never overwrites them.
- `ds-sync eval` measures the generated API against an existing component library that the AI never sees.

### Keep in sync

- `ds-sync init --ci` installs a GitHub workflow. It checks Figma every weekday with one API call, and when Figma changed, it regenerates, tests, compares with Figma and opens a pull request that lists what changed, with before and after renders. The workflow installs this exact version of ds-sync.
- `ds-sync --version` prints the version.

Requires Node 22 or newer and a Figma personal access token with `file_content:read`.
