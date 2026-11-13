---
name: figma-to-storybook
description: Generate a tested Storybook from a Figma design system, as React components or framework-agnostic Web Components (for Vue, Angular, Svelte or any stack), or refresh it after Figma changes, using the ds-sync CLI. Use when the user wants to build, create, generate, refresh or sync Storybook, stories or component docs from a Figma file or link, set up ds-sync, answer ds-sync discovery questions, or understand a ds-sync generation report.
---

# Figma to Storybook (ds-sync)

ds-sync does the work; this skill runs it and handles what needs a person's judgement. Never write components, stories or CSS by hand: everything under the generated folder is rebuilt on every run. To change the output, change Figma, the config overrides, or the generator.

## 1. Prerequisites

- Node 22 or newer: `node --version`.
- The CLI. Use `npx ds-sync` if the package is installed. Until it is published, build it once from the repository:
  ```bash
  git clone https://github.com/shivanshu-epam/ds-to-storybook.git ~/.ds-sync-tool
  cd ~/.ds-sync-tool/engine && npm ci && npm run build
  ```
  Then use `node ~/.ds-sync-tool/engine/dist/cli.js` wherever this skill says `ds-sync`.
- A Figma personal access token with `file_content:read`. Ask the user to put it in `.env` as `FIGMA_TOKEN=...` themselves. Do not ask them to paste it into the chat. If they already did, use it, write it only to `.env`, and recommend rotating it.

## 2. Set up (once per project)

Run in the folder that should hold the config:

```bash
ds-sync init --figma "<figma link>" --yes [--dir storybook] [--variables <export.json>] [--ci]
```

- `init` checks that the token can open the file, detects the stack, and writes `ds-sync.config.json`. It also adds `.env` and `.ds-sync/` to `.gitignore`.
- **Variables:** on non-Enterprise plans the Variables API returns 403, and init says so. Then ask the user to export variables with the ds-sync Figma plugin (`plugin/` in the repo), and pass the file with `--variables`. Without it, generation still works, but colours and spacing are raw values instead of tokens.
- **Stack and target:** init detects the framework and suggests the output. React apps get `react`. Vue, Angular, Svelte, Lit or no framework get `web-components` (custom elements that run in any framework). React monorepos get both. Explain the choice in one line and confirm it with the user; override with `--target react|web-components|both`.

## 3. Discover, then ask the questions

```bash
ds-sync discover
```

Read `.ds-sync/discovery.md` and summarise it for the user in plain words:

- how many component sets were found, on which pages;
- which components get an archetype template (behaviour from WAI-ARIA patterns);
- which get the generic template (visuals only, behaviour not specified).

Then work through **Needs a person**, one topic at a time:

| Review item | What to ask | Where the answer goes (`generate.overrides` in `ds-sync.config.json`) |
| --- | --- | --- |
| Unclear frame | Is it documentation, an example, or neither? | `frames: { "<frame id>": "documentation" \| "example" \| "other" }` |
| Interactive component on the generic template | What should it do: keyboard, focus, ARIA role? Is it fine as visuals-only for now? | Note the answer for the report. A matching template, if one exists: `sets: { "<name>": { "template": "action" } }` |
| Unwanted set (an internal part, an old version) | Should it be left out? | `sets: { "<set name>": { "exclude": true } }` |
| Wrong component name | What should it be called? | `sets: { "<set name>": { "name": "NewName" } }` |
| Working or QA page found | Skip it? | `skipPages: ["<page name>"]` |

Templates available: `action` (button), `checkbox` (control + field + group sets), `accordion` (item set with `_header` and `_panel` layers), `switch` (a set with an on/off variant axis, such as Value=Off/On), `radio`, `radio-field` and `radio-group` (a Radio Control/Field/Group family whose control has a selected axis), `input` (a set with a Placeholder text property), `dialog` (a set named dialog or modal), and `generic` (any set). Never claim behaviour that no template provides.

## 4. Generate and test

```bash
ds-sync generate
cd <outDir> && npm install && npm run typecheck && npm test
```

Report to the user:

- the components generated and the template behind each;
- the token counts printed by `generate`;
- the test result.

Story tests run once per Figma mode: the default modes as project `storybook`, then each other mode as `storybook (<attribute>: <mode>)`, for example `storybook (theme: dark)`. Group failures by mode when you report them; a contrast failure in only one mode is a token problem in that mode.

For each failing test, read the error and say which kind it is:

- **Design issue:** usually axe colour contrast, or a missing accessible name in Figma. Fixing it belongs in Figma. Accepting it for now needs the user's explicit OK. Then record it in `knownIssues`: `{ "<Component>": "<what and why>" }` for every mode, or per mode, `{ "<Component>": { "theme=dark": "<what and why>" } }` (use `default` for the default modes). Axe then reports instead of failing, only in those modes.
- **Generator issue:** for example a TypeScript error or a broken render. Report it with the output. Do not patch the generated files.

Summarise `GENERATION-REPORT.md`: what came from Figma, what came from archetype defaults, and the gaps. Offer to start Storybook (`npm run storybook`, port 6006).

With the React Storybook running, `ds-sync visual` compares every Figma variant with the code, pixel by pixel, and writes `.ds-sync/visual/report.html`. Report the counts (match, close, differ) and look at the worst variants: a different size or a missing or misplaced layer is a generator issue; small text-edge differences are font rendering.

## 5. Keep it in sync

- After a Figma change, run `ds-sync generate` again. It writes `.ds-sync/changes.md` (what changed in Figma, per component) and `.ds-sync/changes/changes.html` (Figma's before/after renders): summarise those for the user before they review the code diff.
- To automate it, run `ds-sync init --ci` (or answer yes during init). That adds `.github/workflows/ds-sync.yml`. Every weekday it checks Figma's version (one API call) and stops if nothing moved; otherwise it regenerates, tests, compares with Figma, and opens a pull request only when the design changed, with the change summary as its description and labels by kind. The repository needs a `FIGMA_TOKEN` secret.

## Rules

- Do not edit generated files. Change Figma, the overrides, or the generator.
- Do not invent behaviour, props or copy that Figma does not have. Name the gap instead.
- Do not set `knownIssues` without the user's explicit agreement.
- Never commit `.env`, and never print the token.

More detail: [reference/config.md](reference/config.md) (every config field) and [reference/troubleshooting.md](reference/troubleshooting.md).
