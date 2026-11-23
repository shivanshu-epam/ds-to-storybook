# ds-sync Figma plugin

Reads the design system file **inside Figma** and saves what ds-sync needs, so ds-sync does not call the Figma REST API. It works on every Figma plan with no API limits, and includes Figma variables, which the REST API only gives on Enterprise. The plugin has no network access: nothing leaves Figma except the file you save.

Why it exists: Figma limits REST reads by plan and seat. On some plans a token can read a file only a few times a month, and a design system file needs many reads. Read through the plugin, the same file costs no API calls at all.

## Install (once)

1. Open the Figma **desktop** app.
2. **Plugins › Development › Import plugin from manifest…** and choose `plugin/manifest.json` from this repository.

## Export

1. Open the design system file. A Community file must be duplicated into your drafts first; plugins run in files you can open.
2. **Plugins › Development › ds-sync › Export for ds-sync**. Leave every page selected (ds-sync discovers components on any page). Keep **Include variant renders** on for the visual check; turn it off for a faster export when you only need code.
3. Save **figma-export.zip** next to `ds-sync.config.json` and point the config at it:

   ```json
   "figma": { "fileKey": "<file key>", "export": "figma-export.zip" }
   ```

4. Run `npx ds-sync generate` as usual. It reads the export when it is there (`--source api` forces the REST API, `--source export` the export).

Re-export when the design changes. With the ds-sync GitHub workflow, committing a new `figma-export.zip` starts a run that regenerates, tests and opens a pull request. No Figma token is needed in that case.

## What the export contains

`figma-export.zip`:

| Entry | Content |
| --- | --- |
| `export.json` | Format `ds-sync/figma-export@1`: file name and key, pages, the component and component-set maps, local styles and their definitions, variables (in the REST API's shape), and the list of renders |
| `pages/<n>.json` | Each page as the REST API returns it (`GET /v1/files/:key`): the same node fields, so ds-sync reads it unchanged |
| `svg/<id>.svg` | Icons and vector shapes inside components |
| `png/<id>@2x.png` | Every variant, rendered by Figma (visual check, change summary) |

**Export variables only** saves `figma-variables.json`, the older variables-only format (`generate.variablesExport`).

## Large files

The plugin reads one page at a time and pauses regularly, so Figma stays usable. Progress shows a running layer count, and **Cancel** stops the export.

Instances outside components (doc pages, example screens) are saved without their contents, because ds-sync never reads them. That is most of a large file.

A layer Figma cannot read, such as an instance of a component set Figma reports as having errors, is skipped and listed under `warnings` in `export.json`. It never stops the export.

On a very large file, export once without variant renders first: it is much faster, and everything except the visual check works.

## Limits

- The change summary (`changes.md`) compares with the IR kept from the previous generation. An export has no Figma version history, and its "before" renders are not available.
- A few REST values are computed differently: a text layer with automatic line height, and text with mixed styles, which reports its first run. Those layers can show small differences.
