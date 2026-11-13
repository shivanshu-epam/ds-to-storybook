# ds-sync.config.json

`ds-sync init` writes the minimal config below. Every other field is optional.

```json
{
  "figma": { "fileKey": "I983NcgqSiY14YkpJbwjG8" },
  "generate": {
    "mode": "auto",
    "outDir": "storybook",
    "targets": [
      { "target": "react", "outDir": "storybook", "packageName": "design-system-ai-storybook" },
      { "target": "web-components", "outDir": "storybook-web-components", "packageName": "design-system-ai-web-components" }
    ],
    "tagPrefix": "ds",
    "variablesExport": "figma-variables.json",
    "modeAttributes": { "semantic.color": "data-theme" },
    "overrides": {
      "skipPages": ["Multi-Project QA"],
      "frames": { "656:102": "example" },
      "sets": {
        "Separator": { "name": "BreadcrumbSeparator" },
        "OldButton": { "exclude": true },
        "Toggle": { "template": "action" }
      },
      "knownIssues": { "Input": "Placeholder contrast 4.39:1 on Filled; design fix requested" }
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `figma.fileKey` | The file key from the Figma link (`figma.com/design/<key>/...`). |
| `generate.mode` | `auto`: discover every component set. `config`: use `generate.components` instead (advanced). |
| `generate.outDir` | Folder for the generated project when `targets` is not set. It is rebuilt on every run. |
| `generate.targets` | One entry per output: `react` (React + TypeScript + CSS Modules) or `web-components` (Lit custom elements for any framework), each with its own `outDir` and `packageName`. |
| `generate.tagPrefix` | Custom element prefix for the `web-components` target (default `ds` → `<ds-button>`). |
| `generate.variablesExport` | Variables JSON from the ds-sync Figma plugin. Not needed on Enterprise plans, where the Variables API is used. |
| `generate.modeAttributes` | Variable collection → HTML attribute that selects its modes. Default: collections with a dark mode use `data-theme`; others use `data-<collection>`. |
| `overrides.skipPages` | Pages to ignore. Pages named QA, test, archive, playground and similar are skipped automatically. |
| `overrides.frames` | Correct a frame's classification: `documentation`, `example`, `page-text` or `other`. Documentation frames become the docs page. |
| `overrides.sets` | By set name or id: `exclude`, `name` (component name) or `template` (`action`, `checkbox`, `accordion`, `switch`, `radio`, `radio-field`, `radio-group`, `generic`). |
| `overrides.knownIssues` | Accepted design issues by component. Their axe checks report as warnings, not failures, and the reason appears in the generation report. Use only with the team's agreement. |

## Drift report (existing code)

For comparing an existing repo with Figma, add `repo` (`path`, `figmaVariables`, `tokenCss`) and hand-mapped `components`. Then run `ds-sync run`. See the engine README.
