# ds-sync: Figma to Storybook

**A tool that turns any Figma design system into a working, tested Storybook, and keeps it in sync, for any tech stack.** Point it at a Figma file and it:

- finds every component;
- generates components (React, or Web Components for any framework), design tokens, stories (with interaction and accessibility tests) and docs pages built from your Figma documentation;
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
| [`engine/templates/github-workflow.yml`](engine/templates/github-workflow.yml) | **GitHub Action** (`ds-sync init --ci`): every weekday it checks whether Figma changed (one API call); if so it regenerates, tests, compares with Figma, and opens a pull request that lists what changed in Figma, labelled by kind, with before/after renders. |
| [`storybook/`](storybook/) | **Example output, React**: generated from the "Design system AI" Figma file. 21 components. Every story is also tested in each Figma mode (light and dark theme, two brands): all 258 pass. Contrast issues in the design (dark theme, second brand, and the Input placeholder) are accepted per mode as known issues, listed in `ds-sync.config.json` and [PLAN.md](PLAN.md). |
| [`storybook-web-components/`](storybook-web-components/) | **Example output, Web Components** from the same file: the same 21 components as `<ds-…>` custom elements that work in React, Vue, Angular, Svelte or plain HTML. Same CSS, same test results. |
| [`PLAN.md`](PLAN.md) | Roadmap, status and open decisions. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How everything works today, with flow diagrams: pipeline, IR, style compiler, tokens, templates, targets, tests, visual check, change summary, CI loop. |
| [`docs/STRATEGY.md`](docs/STRATEGY.md) | The original technical strategy (written before the build). |

## Any tech stack

The tool follows the pattern multi-framework design systems use (Adobe Spectrum, IBM Carbon, Ionic, Shoelace): three layers, each usable on its own.

| Layer | Output | Works with |
| --- | --- | --- |
| Tokens | `tokens.css` (custom properties, modes as attributes), `tokens.json` (W3C DTCG), `tokens.ts` | Any web stack; DTCG feeds Style Dictionary, Tokens Studio and native platforms |
| Components: `web-components` target | Lit custom elements in Shadow DOM, form-associated, with React JSX typings | React, Vue, Angular, Svelte, plain HTML, any future framework |
| Components: `react` target | Native React + TypeScript + CSS Modules | React teams who want idiomatic React components |

`ds-sync init` detects the project's framework and suggests the output: React apps get `react`, every other stack gets `web-components`, and React monorepos get both. One run can produce several targets (`generate.targets`); they share the same CSS, generated once from Figma, so they look identical.

## How it works

1. **Discover.** It finds every component set on every page, including nested ones. It classifies frames as documentation, examples or other, and lists anything unclear for a person to confirm.
2. **Extract.** It reads the Figma REST API into a normalized model: variants, properties, layout, tokens, icons and doc text.
3. **Tokens.** Figma variables become CSS custom properties. Modes (light/dark, brands) become attributes.
4. **Components.** Archetype templates (button, checkbox, accordion, switch, radio, input, dialog) add tested WAI-ARIA behaviour. Every other component is rendered by the generic template from its Figma layers, and its docs say that its behaviour isn't specified yet.
5. **Stories and docs.** It writes variant × state matrices, axis stories, play tests and MDX pages with the Figma documentation text.
6. **Report.** `GENERATION-REPORT.md` records every assumption and gap; `token-map.json` records every token decision.
7. **Visual check.** `ds-sync visual` compares every Figma variant, as Figma renders it, with the generated Storybook, pixel by pixel, and writes an HTML report (Figma, code and difference side by side).
