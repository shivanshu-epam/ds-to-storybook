# ds-sync engine (POC, slice 1: read-only health report)

Reads a Figma design system through the REST API, normalizes it into an IR,
builds a framework-neutral spec per component set, analyses the React code with
the TypeScript compiler API, and writes a drift and health report. It never
changes the design-system repo.

This is the first slice of the proof of concept in the strategy doc (Chapter 19).

## Run it

```bash
npm install
cp .env.example .env    # then paste a Figma personal access token (file_content:read)
npm run ds-sync -- run  # extract → spec → analyze → report
open out/report.html
```

Steps can also run one at a time: `extract`, `spec`, `analyze`, `report`.
Figma responses are cached in `.cache/figma/`; pass `--refresh` to re-read.
`npm test` runs the suite against a recorded Figma fixture, with no token needed.

## What it does

| Step | Input | Output | Deterministic |
| --- | --- | --- | --- |
| `extract` | Figma REST: `GET /v1/files/:key?depth=2`, `GET /v1/files/:key/nodes`, `GET /v1/files/:key/variables/local` (Enterprise; falls back to the repo's `tokens/figma-variables.json`) | `out/figma-ir.json` with a sha256 per component set | Yes |
| `spec` | IR + `archetypes/*.yaml` + config | `out/specs/<id>.spec.yaml` | Yes |
| `analyze` | Repo source: component props (types, defaults, JSDoc), CSS modules, stories, MDX, token CSS | `out/code-ir.json` | Yes |
| `report` | Specs + code IR | `out/report.html`, `out/report.json` | Yes |

There are no AI calls in this slice. Frame classification, prop mapping and doc
interpretation use rules plus explicit config. Model-backed steps come later,
behind schema-checked contracts.

## Configuration (`ds-sync.config.json`)

Each entry maps one Figma component set to one code export:

- `propMap`: a Figma property name maps to a code prop. `null` means intentionally none; `false` means a confirmed code gap.
- `axisRoles`: marks a variant axis as `state` (axes named State/Interaction default to `state`).
- `stateMap`: a Figma state value maps to a code expression (`"disabled"`, `"error+checked"`), or `null` when it is handled elsewhere.

Pinned node ids are tried first; if a set has moved, it is matched by name and the report says so.

## Findings

Findings fall into these categories: `api` (missing or code-only props, enum
options, defaults), `states`, `tokens` (unbound Figma values, raw CSS values,
undefined CSS variables), `stories` (axes without a story, keyboard story),
`docs`, `design-gap` (what the archetype requires that Figma does not specify),
and `extraction`.

Code-only props are reported as info, to be documented rather than hidden.

## Known limits

- Without the Enterprise Variables API, bound variable ids cannot be resolved to names. The report counts bound vs raw values but cannot check that code uses the *same* token.
- Story coverage is matched by story name, not by rendering.
- React and TypeScript only. One code export per Figma component set.
