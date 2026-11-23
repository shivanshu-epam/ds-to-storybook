# ds-sync Claude Code plugin

Skills that run the ds-sync CLI and handle the judgement calls Figma leaves open. The CLI works without them; see [docs/HYBRID.md](../../docs/HYBRID.md) for why the work is split this way.

| Part | What it does |
| --- | --- |
| Skill `ds-sync` | Sets up and runs ds-sync, asks the questions only a person can answer, explains the reports |
| Skill `interpret-component` | Proposes code names and descriptions for one component from its review file (Figma evidence only) |
| Skill `review-decisions` | Walks a person through the proposals to accept, edit or reject them |
| Skill `diagnose-fidelity` | Sorts failing tests and visual differences into design, generator, decision and rendering issues |
| Agent `component-interpreter` | Runs `interpret-component` on a batch in its own context |
| Hook (after Write or Edit) | Validates `ds-sync.decisions.json` and shows errors to Claude |

## Install

In Claude Code:

```
/plugin marketplace add shivanshu-epam/ds-to-storybook
/plugin install ds-sync@ds-sync
```

From a checkout, for development: `claude --plugin-dir engine/claude-plugin`.

## Headless and CI

`ds-sync interpret` runs `claude -p "/ds-sync:interpret-component <file>" --plugin-dir <this folder> --output-format json --json-schema schemas/proposal.schema.json --allowedTools Read --permission-mode dontAsk`, one call per open component, and merges the schema-checked answers into `ds-sync.decisions.json` as proposals. Extra flags go in `DS_SYNC_CLAUDE_ARGS` (for example `--bare` in CI with `ANTHROPIC_API_KEY`).

In GitHub Actions, the same skills run through `anthropics/claude-code-action@v1` with `plugin_marketplaces` and `plugins` inputs, or through `ds-sync interpret` in a step that has Claude Code installed. Proposals go into the pull request for a person to review; nothing is accepted automatically.
