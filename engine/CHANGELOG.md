# Changelog

All notable changes to ds-sync. The CLI (npm package `ds-sync`) and the Claude Code plugin (`ds-sync@ds-sync`) are released together under one version.

## Unreleased

### Documentation engine, phase 1

- Each component gets a Component Doc Spec (`docspec/<Component>.json`, schema in `schemas/component-doc-spec.schema.json`) and the Storybook gets `DOCS-COVERAGE.md`. Together they check that every Figma property, value and designed variant is in Storybook, and that the docs page has the sections its kind requires. The standard is in `standards/production-ready.md`.
- Reference specs for 23 component kinds plus a generic fallback (`references/*.yaml`). The kind comes from the behaviour found in the Figma structure, then from the name.
- New stories, from the Carbon Button pilot (`docs/pilots/carbon-button.md`): one per value of the main appearance property (Secondary, Ghost, Danger and so on), one per state a prop sets (Disabled, Skeleton, Error and so on), and clicks shown in the Actions panel. Story exports never shadow JavaScript globals or the component's imports.
- Code mode (`generate.code`): the API of components that already exist in code is read from the module the team imports (TypeScript, including `forwardRef` and polymorphic components), and each Figma property is mapped to it. The generated components take the code's prop and value names (`kind`, `hasIconOnly`, `size: 'lg'`). The output is `CODE-MAP.md` and `code-map.json`, listing every mapping, the props that exist only in code, and the Figma items with no code counterpart, for review.
- The `react-code` target: a Storybook of the team's real components, imported from their package and set up from Figma through the code map. It writes stories for every Figma property, value and designed variant the code can express, controls from the code's types, and a docs page with the Figma-to-code table and the props that exist only in code. Hover, focus and pressed states count as interactive. Example data Figma lacks goes in `code.examples`, and parents in `code.parents`.
- Decisions can mark a Figma property `"role": "internal"` (a construction helper such as Carbon's Resizer). It keeps its Figma default and stays out of the controls, stories and props table. Decisions can also rename a variant property's `values` without code (`"Danger primary": "danger"`).
- Decisions can make a Figma value its own component: `"components": { "Skeleton": "ButtonSkeleton" }`. The value leaves the prop's public type and control, the component file exports `ButtonSkeleton` (which renders that design and takes every other prop), and its story renders it. Nested instances that use the value keep the exact design.
- Internal properties are also hidden in the Web Components Storybooks.
- Fidelity diagnostics (Figma links, visual check, scorecard, generation notes) moved off the developer page to a "Design review" page under each component. The developer page links to it.
- Usage guidance (roadmap phase 5). `ds-sync generate` writes one evidence file per component to `.ds-sync/usage/`: numbered sources from Figma (description, documentation frames, properties), the team's code (prop descriptions, in code mode), this system's components of the same kind, and new general guidance per kind in the reference specs. The `write-usage` skill drafts When to use, When not to use, per-variant and content guidance, with every sentence citing those sources. `ds-sync usage` runs it headless (or records a session's answer with `--from`), keeps only sentences whose citations exist, and stores them with the cited text in `ds-sync.decisions.json` as a proposal with its own status. Docs pages show the Usage section, marked as a draft until a person accepts it.
- `ds-sync docs check`: the documentation gate. It fails when a gap appears that the reviewed baseline (`ds-sync.docs-baseline.json`, committed) does not accept, and reports gaps that closed. `--update-baseline` records the current state, and `--strict` fails on any gap. The GitHub workflow runs it and reports the result in the pull request.

## 0.2.0

The first public release. Version 0.1.0 was never published.

### Read Figma without API limits

- The ds-sync Figma plugin saves `figma-export.zip`: the file as the REST API returns it, with styles, variables (on any plan) and renders. ds-sync reads it instead of the API (`figma.export` in the config; `--source api|export`). There are no API limits, and no token is needed. The GitHub workflow runs when a new export is committed.
- Tested on a third design system, Carbon v11, read only through the plugin export. The fixes it led to: tokens bound by variable id, CSS-safe variable names, reserved JavaScript and element names, unique icon names, valid Storybook toolbar keys, and per-mode story tests only for collections that hold colours.
- Accessibility from structure: a button or link whose label is hidden in a variant (icon-only) is named by its label text; a component that contains other controls is not itself made a button, link or switch; a disclosure whose header holds a control uses it as the trigger.
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
