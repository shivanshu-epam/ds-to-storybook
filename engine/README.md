# ds-sync engine

The `ds-sync` command-line tool. It reads a Figma design system through the REST API and generates a tested Storybook project. It can also report drift between Figma and an existing codebase. Needs Node 22+.

## Install

```bash
npm ci && npm run build && npm link     # until published: puts ds-sync on your PATH
```

`npm pack` produces an installable tarball (`ds-sync-<version>.tgz`). The package ships `dist/`, `archetypes/` and `templates/`.

## Commands

| Command | What it does |
| --- | --- |
| `ds-sync init --figma <link> [--target react\|web-components\|both] [--dir storybook] [--variables file.json] [--ci] [--yes]` | Checks that the token can open the file, detects the stack and chooses the output target(s), writes `ds-sync.config.json`, and git-ignores `.env` and `.ds-sync/`. `--ci` adds the GitHub workflow. |
| `ds-sync discover` | Finds every component set, classifies frames and proposes templates. Writes `.ds-sync/discovery.md` with the items that need a person. |
| `ds-sync generate [--figma-version <id>]` | Discover, then extract, then generate one project per target (`react`, `web-components`). `--figma-version` pins a Figma version. |
| `ds-sync outputs` | Lists the generated folders in GitHub Actions output format (used by the workflow). |
| `ds-sync run` | Drift report for an existing repo (needs `repo` and hand-mapped `components` in the config). Writes `.ds-sync/report.html`. |
| `extract`, `spec`, `analyze`, `report` | The drift report steps, one at a time. |

The token comes from `FIGMA_TOKEN` in the environment or in `.env` next to the config. Figma responses are cached in `.ds-sync/cache`; `--refresh` re-reads them.

Config reference: [`../skills/figma-to-storybook/reference/config.md`](../skills/figma-to-storybook/reference/config.md).

## Layout

| Path | Role |
| --- | --- |
| `src/figma` | REST client: cache, 429 retries, images |
| `src/discover` | Page, frame and component discovery; template proposals |
| `src/ir` | Figma IR: layers, layout, styles, bound variables, property links |
| `src/spec`, `src/code`, `src/diff`, `src/report` | Drift report: spec vs code |
| `src/generate` | Tokens (CSS, DTCG JSON, TS), style compiler, icons, React project scaffold, templates (`action`, `checkbox`, `accordion`, `switch`, `radio`, `radio-field`, `radio-group`, `input`, `generic`) |
| `src/generate/wc` | Web Components target: Lit renderers that reuse each template's model (`radio.ts`: the radio family; `input.ts`: text input), and the project scaffold |
| `archetypes/` | Behaviour packs (required states, keyboard) |
| `templates/github-workflow.yml` | CI template used by `init --ci` |

## Develop

```bash
npm test              # 48 tests, against recorded Figma fixtures (no token needed)
npm run typecheck
npm run ds-sync -- generate   # run from source with tsx
```
