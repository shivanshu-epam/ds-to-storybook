# ds-sync

Turn a Figma design system into a working, tested Storybook, and keep it in sync with Figma.

- **Generates** components from your Figma component sets, as native React (TypeScript, CSS Modules) or as framework-agnostic Web Components (Lit) for Vue, Angular, Svelte or plain HTML, plus design tokens (CSS custom properties, W3C DTCG JSON, TypeScript).
- **Tests** every story: it must render, its interactions must work, and axe must find no accessibility violations, in every Figma mode (light, dark, brands).
- **Compares** every Figma variant with the generated code, pixel by pixel.
- **Keeps in sync**: a GitHub workflow checks Figma every weekday and opens a pull request that lists what changed in Figma.
- **Says what Figma does not specify** (behaviour, accessible names) instead of inventing it.

Needs Node 22 or newer and a Figma personal access token with `file_content:read`.

## Quick start

In the folder that should hold your Storybook:

```bash
echo "FIGMA_TOKEN=figd_…" > .env
npx ds-sync init --figma "https://www.figma.com/design/<file-key>/..."
npx ds-sync discover          # review .ds-sync/discovery.md
npx ds-sync generate          # writes ./storybook (and/or ./storybook-web-components)
cd storybook && npm install && npm run storybook
```

`init` checks that the token can open the file, detects your stack and chooses the output (React apps get `react`; Vue, Angular, Svelte, Lit or no framework get `web-components`; React monorepos get both), writes `ds-sync.config.json`, and adds `.env` and `.ds-sync/` to `.gitignore`. Add `--ci` to install the GitHub workflow.

On Figma plans without the Variables API (non-Enterprise), export your variables with the ds-sync Figma plugin and pass the file with `--variables`; without it, colours and spacing stay raw values instead of tokens.

## Commands

| Command | What it does |
| --- | --- |
| `ds-sync init --figma <link> [--target react\|web-components\|both] [--dir storybook] [--variables file.json] [--ci] [--yes]` | Set up: token check, stack detection, config, `.gitignore` entries; `--ci` adds the GitHub workflow. |
| `ds-sync discover` | Find every component set, classify frames, propose a template per component. Writes `.ds-sync/discovery.md` with the items that need a person. |
| `ds-sync generate [--figma-version <id>]` | Discover, extract, generate one project per target. When the output came from an older Figma version, also writes what changed (`.ds-sync/changes.md`). |
| `ds-sync visual [--url http://localhost:6006] [--dir storybook] [--only A,B]` | Compare every Figma variant with the running React Storybook, pixel by pixel → `.ds-sync/visual/report.html`. |
| `ds-sync changes [--since <version>]` | What changed in Figma since a version: per component API, variants, values and docs, with Figma's before/after renders. |
| `ds-sync status` | Is Figma newer than the generated output? One API call (for CI). |
| `ds-sync outputs` | The generated folders and pull-request labels, in GitHub Actions output format (for CI). |

The token comes from `FIGMA_TOKEN` in the environment or in `.env` next to the config. Figma responses are cached in `.ds-sync/cache`; `--refresh` re-reads them; `--figma-version` pins a version for reproducible runs.

Configuration reference, templates and how it all works: [the repository](https://github.com/shivanshu-epam/ds-to-storybook) ([ARCHITECTURE.md](https://github.com/shivanshu-epam/ds-to-storybook/blob/main/ARCHITECTURE.md), [config reference](https://github.com/shivanshu-epam/ds-to-storybook/blob/main/skills/figma-to-storybook/reference/config.md)).

## Develop

```bash
npm ci
npm test              # engine tests against recorded Figma fixtures (no token needed)
npm run typecheck
npm run ds-sync -- generate   # run from source with tsx
```

| Path | Role |
| --- | --- |
| `src/figma` | REST client: cache, retries, images |
| `src/discover` | Page, frame and component discovery; template proposals |
| `src/ir` | Figma IR: layers, layout, styles, bound variables, property links |
| `src/generate` | Tokens, style compiler, icons, React scaffold, templates (`action`, `checkbox`, `accordion`, `generic` with the `switch`, `radio`, `input` and `dialog` packs) |
| `src/generate/wc` | Web Components target (Lit) |
| `src/visual` | Visual check against Figma |
| `src/changes` | Figma version diff and before/after renders |
| `src/spec`, `src/code`, `src/diff`, `src/report` | Drift report for existing code (earlier prototype) |
| `archetypes/` | Behaviour contracts per archetype |
| `templates/github-workflow.yml` | CI template used by `init --ci` |

## Licence

MIT
