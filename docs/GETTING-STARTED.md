# Getting started with ds-sync

This guide takes a team from a Figma design system file to a running, tested Storybook, and then keeps that Storybook in sync with Figma. No AI is needed for any of it: ds-sync is a command-line tool. The Claude Skill (section 9) is an optional guide on top.

**Time:** about 15 minutes for setup. Generation takes a few minutes for a typical file; very large files (hundreds of nested frames) can take 20–30 minutes the first time because of Figma's API rate limits, then seconds when cached.

## 1. What you get

From one Figma file, ds-sync writes a complete Storybook project (or two):

- **Components** from every component set: React (TypeScript, CSS Modules) and/or Web Components (Lit) that work in Vue, Angular, Svelte, plain HTML or React.
- **Design tokens** from your Figma variables: `tokens.css` (custom properties, with light/dark and brand modes), `tokens.json` (W3C DTCG) and `tokens.ts`.
- **Stories** for every variant, with interaction tests and accessibility checks, run in every Figma mode.
- **Docs pages** built from your Figma documentation frames.
- **A report** (`GENERATION-REPORT.md`) of every assumption and everything Figma does not specify.
- Optionally, **a GitHub workflow** that checks Figma every weekday and opens a pull request when the design changes.

## 2. Before you start

| You need | Notes |
| --- | --- |
| Node.js 22 or newer | `node --version` |
| A Figma personal access token | Figma → Settings → Security → Personal access tokens. Scope: **File content: read**. |
| Access to the design system file | The token's owner must be able to open the file. For a community file, duplicate it into your account first. |
| The file link | For example `https://www.figma.com/design/AbC123…/My-Design-System` |
| (Optional) GitHub repository | For the sync workflow. |
| (Optional) Figma desktop app | To export variables on non-Enterprise plans (section 4). |

## 3. Install

Once ds-sync is published to npm, nothing needs installing: every command below runs with `npx ds-sync …`.

Until then, build it once from the repository:

```bash
git clone https://github.com/shivanshu-epam/ds-to-storybook.git ~/ds-sync-tool
```

```bash
cd ~/ds-sync-tool/engine && npm ci && npm run build && npm link
```

`npm link` puts a `ds-sync` command on your PATH. In the steps below, use `ds-sync …` instead of `npx ds-sync …`.

## 4. Set up a project

Create (or open) the folder that should hold your Storybook. This can be a new folder or your app's repository.

**4.1 Add the token.** Put it in a `.env` file in that folder (ds-sync adds `.env` to `.gitignore`):

```bash
echo "FIGMA_TOKEN=figd_your_token_here" > .env
```

Never commit the token or paste it into chats or tickets.

**4.2 Run init:**

```bash
npx ds-sync init --figma "https://www.figma.com/design/<file-key>/<name>"
```

It checks that the token can open the file, looks at your project (React? Vue? Angular? none?), and asks:

- **Output.** React apps get `react`; Vue, Angular, Svelte, Lit or no framework get `web-components`; a React monorepo gets both. You can choose with `--target react|web-components|both`.
- **Folder** for the generated Storybook (default `storybook`).

It writes `ds-sync.config.json`. Add `--yes` to accept every suggestion, and `--ci` to also install the GitHub workflow (section 7).

**4.3 Variables (tokens).**

- **Figma Enterprise:** nothing to do; ds-sync reads variables through the API.
- **Other plans:** the Variables API is not available. Export them with the ds-sync Figma plugin:
  1. In the Figma desktop app, open the design system file.
  2. **Plugins → Development → Import plugin from manifest…**, pick `plugin/manifest.json` from the ds-sync repository.
  3. Run **ds-sync: export variables**, click **Download figma-variables.json**.
  4. Put the file next to `ds-sync.config.json` and set `"variablesExport": "figma-variables.json"` under `generate`.

  Without variables, generation still works, but colours and spacing are raw values instead of tokens.

## 5. Generate

**5.1 Discover** what is in the file:

```bash
npx ds-sync discover
```

Open `.ds-sync/discovery.md`. It lists every component set found, the template chosen for each, and **Needs a person** items. Check:

- Components you do not want (internal parts, old versions): add `"sets": { "<name>": { "exclude": true } }` under `generate.overrides`.
- Wrong names: `"sets": { "<name>": { "name": "BetterName" } }`.
- Working or QA pages to skip: `"skipPages": ["<page name>"]`.
- Frames classified wrongly (documentation, example, other): `"frames": { "<frame id>": "documentation" }`.

The [config reference](../engine/claude-plugin/skills/ds-sync/reference/config.md) lists every option.

**5.2 Generate:**

```bash
npx ds-sync generate
```

This writes the Storybook folder(s). Everything inside the generated `src/`, `.storybook/` and `types/` folders is rebuilt on every run: **do not edit those files by hand**. Change Figma, the config overrides, or report a generator issue instead.

**5.3 Run it:**

```bash
cd storybook && npm install && npm run storybook
```

Storybook opens at <http://localhost:6006> (the Web Components project uses port 6007). Each component has a docs page, its stories, and a **Figma Variants** story showing every Figma variant.

## 6. Check it

**6.1 Story tests** (render, interactions, accessibility, every Figma mode):

```bash
npm run typecheck && npm test
```

Failures are usually **design issues**, most often colour contrast in one theme. Fix them in Figma, or accept one for now with a recorded reason, per component and optionally per mode:

```json
"knownIssues": {
  "Badge": { "theme=dark": "Text #111827 on badge colours is 1.7–3.5:1; tokens to be fixed in Figma" }
}
```

In those modes the accessibility check reports instead of failing; every other mode stays strict. Accept only what your design-system team agrees to.

**6.2 Visual check against Figma.** With the React Storybook running:

```bash
npx ds-sync visual
```

It compares every Figma variant (Figma's own render) with the Storybook, pixel by pixel, and writes `.ds-sync/visual/report.html`: Figma, code and difference side by side, worst first. A different size or a missing or misplaced layer is a generator issue worth reporting; small differences on text edges are font rendering.

**6.3 Read the report.** `GENERATION-REPORT.md` in the generated folder lists, per component, what came from Figma, what was assumed, and what Figma does not specify (for example the behaviour of components that have no behaviour template).

**6.4 Fonts, sidebar and documentation** (optional settings under `generate` in `ds-sync.config.json`):

```json
"generate": {
  "fonts": { "Acme Sans": { "package": "@acme/fonts", "imports": ["@acme/fonts/sans.css"] } },
  "categories": { "Actions": ["Button", "Link"], "Forms": ["Checkbox", "Input"] },
  "publicComponents": ["CheckboxBase"],
  "internalComponents": ["ListItemRow"]
}
```

- **Fonts.** Every font family the Figma file uses is loaded from its open-source npm package (Fontsource) when one exists, with the weights Figma uses. System fonts (SF Pro, Menlo) stay system fonts. A licensed font needs your own package under `fonts`. The "Fonts" table in `GENERATION-REPORT.md` lists how each family was loaded, and any it could not load; a family published under a slightly different name (for example "TASA Orbiter Display" loaded as "TASA Orbiter") is reported as a substitute to confirm.
- **Sidebar.** Components go under `Components/<category>` when `categories` assigns one. Components Figma marks as building blocks (names starting with `_` or `.`, or ending in `Base`) are built and tested but not listed; their parent's docs page links to them under Composition. `publicComponents` and `internalComponents` override that.
- **Docs pages** follow [the documentation standard](fidelity/STANDARD.md): Overview, Preview, Variants, Properties (grouped, with the Figma property each one comes from), States, Behaviour, Composition, Accessibility, Code and Design reference (Figma links, nested consistency, visual check). Test-only stories are kept out of the sidebar.

**6.5 Scorecards and the audit.** Every component gets a scorecard: one status per fidelity measure (visual, variants, properties, nested consistency, interaction, tokens, accessibility, documentation, open decisions). It appears on its docs page, in `GENERATION-REPORT.md`, and in `scorecard.json`. There is no overall score: each measure is checked on its own. To include real test results:

```bash
cd storybook && npx vitest run --reporter=json --outputFile=../.ds-sync/tests.json; cd ..
```

```bash
ds-sync audit --tests .ds-sync/tests.json
```

The audit writes `.ds-sync/audit.md` (and a short `audit-summary.md`). If a visual check of the same Figma version exists, it uses that too. With `--strict` it exits with an error when any public component fails a measure, for use as a CI gate. The GitHub workflow adds the summary to each pull request.

## 7. Keep it in sync (GitHub)

1. Run `npx ds-sync init --ci` (or answer yes during init). It adds `.github/workflows/ds-sync.yml`.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name `FIGMA_TOKEN`, value: the token.
3. In GitHub: **Settings → Actions → General → Workflow permissions**: tick **Allow GitHub Actions to create and approve pull requests**.
4. Commit the config and the generated folders, push.

Every weekday the workflow asks Figma for the file version (one API call) and stops if nothing changed. When the design changed, it regenerates, runs the tests, compares with Figma, and opens a pull request:

- the description lists **what changed in Figma** per component (properties, variants, colours, sizes, text, docs);
- labels say what kind of change it is (`component-api`, `styles`, `content`, `docs`, `components`);
- the run's `ds-sync-review` artifact holds Figma's before/after renders of the changed variants and the visual report.

Review and merge it like any other pull request. You can also start it by hand: **Actions → ds-sync → Run workflow**.

## 8. Use the components in an app

Both outputs are packages whose entry point is TypeScript source (`src/index.ts`), plus `tokens.css` and `tokens.json`. Use them from an app whose bundler compiles TypeScript (Vite, Next.js, Angular CLI, Vue CLI): reference the folder (for example `"my-design-system": "file:../storybook"` in the app's `package.json`, or a workspace in a monorepo), or publish it to your registry as is. ds-sync does not yet produce a precompiled library build.

**React target:**

```tsx
import { Button } from 'my-design-system-storybook';
import 'my-design-system-storybook/tokens.css';

<Button variant="primary" onClick={save}>Save</Button>
```

**Web Components target** (any framework):

```html
<script type="module">import 'my-design-system-web-components';</script>
<ds-button variant="primary">Save</ds-button>
```

- **Vue 3:** tell Vue the `ds-` tags are custom elements: `vue({ template: { compilerOptions: { isCustomElement: (t) => t.startsWith('ds-') } } })`.
- **Angular:** add `schemas: [CUSTOM_ELEMENTS_SCHEMA]` to the component or module.
- **React 19:** works directly; add `types/react.d.ts` from the package to your `tsconfig` for typed JSX.
- Form controls (checkbox, radio, switch, input) take part in `<form>` submission.

Every component's docs page shows the snippet for HTML, React, Vue, Angular and Svelte.

**Themes and brands:** set the mode attributes on `<html>`, for example `<html data-theme="dark">`; the token CSS switches values.

## 9. Optional: with Claude

Everything above works without AI. With Claude Code, two more things are possible: a guided run, and code names and descriptions a design-system engineer would ship instead of Figma's literal names. Why the work is split this way: [HYBRID.md](HYBRID.md).

**Install the plugin** (in Claude Code):

```
/plugin marketplace add shivanshu-epam/ds-to-storybook
/plugin install ds-sync@ds-sync
```

Its `ds-sync` skill runs the same commands and handles the questions that need a person:
- it reads `discovery.md` with you;
- it asks what an unclear component should do, and records your answers as overrides;
- it explains failing tests (design issue or generator issue) and summarises the reports.

**Decisions: better names and descriptions, reviewed by you.** Figma names properties for designers (`Show Leading Icon`, `isIntermediate`). Decisions turn them into code names and plain descriptions, with the evidence for each:

```bash
ds-sync review                        # one evidence file per component → .ds-sync/review/
ds-sync interpret --budget 0.5        # Claude proposes, headless (needs the claude command and your login or API key)
ds-sync decisions validate            # check ds-sync.decisions.json against Figma
ds-sync generate --decisions proposed # preview the proposals
ds-sync decisions accept --only "Checkbox,Badge" --by "<your name>"
ds-sync generate                      # applies accepted decisions only
```

Things to know:
- **Proposals are only proposals.** Proposals are never applied until accepted, except in a `--decisions proposed` preview. Accepted entries are never overwritten by a later `interpret`. A renamed prop breaks existing code that uses the old name, so accept with care.
- **Writing decisions without AI.** You can write `ds-sync.decisions.json` by hand; its schema is `engine/schemas/decisions.schema.json`.
- **Measuring against existing code.** If your team already has component code, `ds-sync eval --reference <components folder> --decisions proposed` measures how many of its props the generated API matches.

## 10. Troubleshooting

| Problem | What to do |
| --- | --- |
| `Figma rejected FIGMA_TOKEN` or HTTP 403 on the file | The token is wrong or expired, or its owner cannot open the file. Create a new token with *File content: read*; for community files, duplicate the file first. |
| `Variables API needs an Enterprise plan` | Expected on other plans: export variables with the plugin (section 4.3). |
| "Figma rate limit hit; waiting…" | Normal on large files: ds-sync waits and retries. Responses are cached in `.ds-sync/cache`, so a second run is fast. |
| Discovery finds few components | Make sure component pages are not named like QA/test/archive pages and do not start with `_`. Check `.ds-sync/discovery.md`; force pages or sets with overrides. |
| A component is "visuals only" | It has no behaviour template (only button, checkbox, radio, switch, input, dialog and accordion patterns do). Its docs say so; the behaviour must be added by your team or a future template. |
| Storybook shows "Failed to fetch dynamically imported module" | A stale Vite cache after regenerating: stop Storybook, delete `node_modules/.cache/storybook`, start again. |
| Story tests fail on colour contrast | A design token issue: fix in Figma or accept it in `knownIssues` (section 6.1). |
| The pull request workflow cannot open pull requests | Enable "Allow GitHub Actions to create and approve pull requests" (section 7, step 3). |

More: [troubleshooting reference](../engine/claude-plugin/skills/ds-sync/reference/troubleshooting.md), [architecture](../ARCHITECTURE.md).

## 11. Updating ds-sync

- From npm: `npx ds-sync@latest generate` uses the newest version.
- From source: `cd ~/ds-sync-tool && git pull && cd engine && npm ci && npm run build`.

After updating, run `generate` and review the diff: a new version may improve the generated code for the same Figma file.
