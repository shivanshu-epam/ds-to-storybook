# ds-sync: export variables (Figma plugin)

The Figma Variables REST API is Enterprise-only. This plugin exports a file's local variables, with every mode and alias, in the JSON format ds-sync reads. It has no network access: nothing leaves Figma.

## Use

1. In the Figma desktop app, open the design system file.
2. Choose **Plugins → Development → Import plugin from manifest…** and pick `plugin/manifest.json` from this repo.
3. Run **ds-sync: export variables** and click **Download figma-variables.json**.
4. Put the file next to `ds-sync.config.json` and set `"variablesExport": "figma-variables.json"` under `generate` (or pass `--variables` to `ds-sync init`).

## Format

```json
{ "variables": { "<collection>": [["<name>", "C|F|S", "<value> or {\"<mode>\": <value>}", "var(--css-name)"]] } }
```

Colours are hex. Aliases are `"@<collection>:<name>"`. Boolean variables are skipped.
