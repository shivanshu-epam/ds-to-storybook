# ds-sync: Figma to Storybook

**A tool that turns any Figma design system into a working, tested Storybook, and keeps it in sync.** Point it at a Figma file and it:

- finds every component;
- generates React components, design tokens, stories (with interaction and accessibility tests) and docs pages built from your Figma documentation;
- tells you what Figma doesn't specify.

## Quick start

Until ds-sync is published to npm, build it once from this repo:

```bash
git clone https://github.com/shivanshu-epam/ds-to-storybook.git ds-sync-tool
cd ds-sync-tool/engine && npm ci && npm run build && npm link   # gives you the ds-sync command
```

Then, in your own project folder:

```bash
ds-sync init --figma "https://www.figma.com/design/<file-key>/..."   # asks for a Figma token, detects your stack
ds-sync discover                                                     # review what was found: .ds-sync/discovery.md
ds-sync generate                                                     # writes ./storybook
cd storybook && npm install && npm run storybook                     # http://localhost:6006
```

Prefer a guided run? Use the **Claude Skill** in [`skills/figma-to-storybook`](skills/figma-to-storybook/SKILL.md). It runs these steps, asks the questions only a person can answer (for example, what a component should do), and explains the results.

## What's in this repo

| Folder | What it is |
| --- | --- |
| [`engine/`](engine/) | **The tool**: the `ds-sync` CLI (TypeScript, Node 22+). |
| [`skills/figma-to-storybook/`](skills/figma-to-storybook/) | **Claude Skill** that drives the CLI and handles the judgement calls. |
| [`plugin/`](plugin/) | **Figma plugin** that exports variables, for teams not on a Figma Enterprise plan. |
| [`engine/templates/github-workflow.yml`](engine/templates/github-workflow.yml) | **GitHub Action** (`ds-sync init --ci`) that regenerates weekly or on demand and opens a pull request. |
| [`storybook/`](storybook/) | **Example output**: generated from the "Design system AI" Figma file. 21 components, 78 of 79 story tests pass (the failure is a real contrast issue in the design). |
| [`PLAN.md`](PLAN.md) | Roadmap, status and open decisions. |

## How it works

1. **Discover.** It finds every component set on every page, including nested ones. It classifies frames as documentation, examples or other, and lists anything unclear for a person to confirm.
2. **Extract.** It reads the Figma REST API into a normalized model: variants, properties, layout, tokens, icons and doc text.
3. **Tokens.** Figma variables become CSS custom properties. Modes (light/dark, brands) become attributes.
4. **Components.** Archetype templates (button, checkbox, accordion) add tested WAI-ARIA behaviour. Every other component is rendered by the generic template from its Figma layers, and its docs say that its behaviour isn't specified yet.
5. **Stories and docs.** It writes variant × state matrices, axis stories, play tests and MDX pages with the Figma documentation text.
6. **Report.** `GENERATION-REPORT.md` records every assumption and gap; `token-map.json` records every token decision.
