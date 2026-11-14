# Fidelity roadmap

Ordered by impact and dependency. Each step is a generator change, so it applies to every component and every design system, and each ends with regeneration and the measures in [QUALITY.md](QUALITY.md) on both Blade and "Design system AI".

| Order | Work | Fixes | Depends on | Size | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | **Nested instance model**: record, per variant, each nested instance's variant values, booleans, texts, instance swaps and exposed nested properties (by path) | Root cause of F1, F2 | none | M | Done (13 Nov 2026) |
| 2 | **Exposed nested properties become API** of the parent component | F2 (32 Blade sets) | 1 | M | Done (13 Nov 2026) |
| 3 | **Per-variant nested prop mapping** (constant / lookup / pass-through), generalising today's text and icon lookups | F1 (109 nested layers) | 1, 2 | M | Done (13 Nov 2026) |
| 4 | **Nested consistency check** (automated measure 4) | Proves 1–3 | 3 | S | Done (13 Nov 2026) |
| 5 | **Composition for repeated children**: `children` API + context for parent-level configuration | F9 | 3 | M | Done (14 Nov 2026): placeholder "Slot" instances become `children`; repeated copies of one child accept your own children, and the parent sets the values it drives on each (shared values, numbering by position) |
| 6 | **Docs and sidebar to the standard**: remove stray stories; plain-language names; categories; hide building blocks and test stories; tiered docs page; properties table with groups and Figma mapping; scorecard section | F6, F7, structure issues | decisions on categories and public/internal | L | Done (13 Nov 2026); the docs page shows nested consistency and visual results, the full scorecard comes with step 12 |
| 7 | **Designed vs computed combinations** in stories | F5 | 6 | S | Done (13 Nov 2026): docs pages state how many combinations Figma designs and that the rest are computed |
| 8 | **Vector shapes as SVG** (boolean operations, vectors, ellipses, lines that are not icons) | F3; spinners, illustrations | none | M | Done (13 Nov 2026) |
| 9 | **Fonts**: load Google-hosted families, report missing ones | Blade headings | none | S | Done (13 Nov 2026) |
| 10 | **Instance-swap properties as slots** | 43 Blade properties | 1 | M | Done (13 Nov 2026): an instance swap bound to a layer is a content prop (React `ReactNode`, Web Components named `<slot>`) with the Figma instance as default |
| 11 | **Behaviour by structure**: recognise disclosure, checkbox, radio, button by properties (`isExpanded`, `isChecked`, label text, `isDisabled`), not names | F8 | 2, 3 | L | Done (14 Nov 2026): checkbox, radio, disclosure (by axis or by a boolean with a nested trigger button), tab lists, radio groups and checkbox groups from structure; button and link from their names, with an `archetype` decision to correct either. Not covered: combobox and menu (they need their full contracts) |
| 12 | **`ds-sync audit` and `docs lint`**, decisions file, scorecards in reports and PRs | Measures 2, 3, 8; decision mechanism | 4, 6 | M | Partly done (14 Nov 2026): per-component scorecards (9 measures, no overall score) in docs pages, GENERATION-REPORT.md and scorecard.json; `ds-sync audit` with real test and visual results, `--strict` gate, summary in the workflow PR; the decisions file exists (phase 1). A separate docs lint is still open (documentation completeness is a scorecard measure) |
| 13 | **Storybook Documentation Skill** | Repeatability | 12 | M | |
| 14 | **Apply to the whole library**, remeasure, close or record every open item | Phase 5 | all | ongoing | |

Size: S about a day, M a few days, L a week or more.

**Proposed first slice (Phase 3 start):** steps 1–4 on Accordion and ActionListItem, then regenerate all of Blade and the first design system and report the nested consistency and visual-fidelity changes. Steps 6–7 follow immediately, because the documentation experience is what developers see.
