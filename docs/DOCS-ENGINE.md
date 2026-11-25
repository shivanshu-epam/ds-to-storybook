# From Figma-shaped docs to developer documentation

Date: 24 Nov 2026. Status: audit, research and proposed architecture, with the first four decisions taken (section 8). Nothing in this document is implemented yet.

Every finding is marked:

- **[verified]**: inspected today, in the live Carbon Storybook, Carbon's source, Fluent UI's live Storybook, or our generated Carbon Storybook and the engine;
- **[knowledge]**: from general knowledge, not checked today;
- **[recommendation]**.

## 1. The finding in one paragraph

The gap between our Carbon Button and Carbon's own Button is **not mainly information architecture. It is whose API the documentation describes.** Carbon's Storybook documents Carbon's code: hand-written stories, controls generated from the React prop types, and a hand-written overview. Ours documents Figma's model of the component: Figma's property names, axis grids, Figma construction details, and our generator's diagnostics on the same page.

Restructuring the sidebar would not close the gap. Closing it needs a **developer-facing component specification** between Figma and Storybook, deciding:

- the API;
- the stories worth having;
- the controls;
- what each audience reads.

That specification has to come from code when code exists, and from reviewed decisions when it does not.

## 2. Phase 1: audit (Carbon Button)

### 2.1 Side by side

| | Carbon's Storybook **[verified]** | Ours, generated from Carbon's Figma **[verified]** |
| --- | --- | --- |
| Entries | 1 docs page "Overview" + 10 stories in the sidebar: Default, Danger, Danger Ghost, Danger Tertiary, Ghost, Icon Button, Icon Button With Badge, Secondary, Skeleton, Tertiary. "Set Of Buttons" is a subfolder (composition). 13 test-only stories (Radius, Fluid…) are tagged `test` without `dev`: tested, not listed | 1 docs page + 5 stories: Default, Style and state, Type, Size, Optional parts (grids of Figma axis values). "Activates" (interaction test) and "Figma variants" are hidden |
| Story naming | By meaning: a story is a variant a developer would pick ("Danger Ghost", "Icon Button") | By Figma property: a story is an axis ("Style and state") |
| Story content | One rendered component, its args set (`Danger: { kind: 'danger' }`), every control live | A grid of every value of an axis; the controls apply to every cell |
| Controls | From the prop types (react-docgen) with curated argTypes: `kind` select primary…danger--tertiary; `size` select xs…2xl; `renderIcon` select mapping icon names to components; `disabled`, `href`, `iconDescription`, `tabIndex`, `type`, `role`. Hidden: `ref`, `as`, `children`, `className`, event handlers | From Figma properties: `styleVariant` (Figma "Style"), `size` with Figma labels (`2x-large`, `extra-large`, `expressive`), `state` (`enabled`, `skeleton`), `type` (`text-icon`, `icon-only`), `icon`, `resizer` (a Figma construction layer), `buttonText`, `swapIcon` (an object control nobody can use) |
| API | `kind`, `size`, `renderIcon`, `hasIconOnly`, `iconDescription`, `href`, `as`, `badgeCount`, tooltip props; `ButtonSkeleton` is a **separate component**; `IconButton` and `ButtonSet` are related components | Every Figma property becomes a prop; Skeleton is a `state` value; no `href`, `onClick`, `as` or icon description |
| Overview page | Hand-written MDX (`parameters.docs.page`): Overview with a live example; Radius (theming custom properties, per-corner tokens, code); Danger Button; Icon-only Button; Skeleton state; **Component API** (prose per notable prop, and sub-components); References; Feedback | Generated: Overview, Preview, Variants (axis grids), Properties (table with Figma mapping), Try it, States (CSS mapping), Behaviour, Composition, Accessibility, Code, **Design reference with a 9-line scorecard, nested-consistency counts and generator notes**, then the Figma documentation frames |
| Code examples | Real usage, including theming and SCSS | One generated example (`<Button />` with defaults) |

### 2.2 Gaps by category

| Category | Gap | Root cause |
| --- | --- | --- |
| API | Props named and shaped like Figma (`styleVariant`, `state: skeleton`, size labels) | No source of API truth except Figma. AI naming decisions exist but cover names, not shapes (one prop vs a separate component, enum values) |
| API | Figma construction details exposed (`resizer`, `swapIcon` as an object) | No "is this API?" decision (the planned "drop" role) |
| IA | Stories per Figma axis, not per meaningful variant or property | Stories are generated from axes; there is no story plan |
| IA | No relationship between Button, IconButton, ButtonSet, ButtonSkeleton | Figma has one set per thing; the relationships are code-level knowledge |
| Controls | Controls follow Figma (labels, object controls, Figma-only booleans) | The controls follow the generated props; there is no curation (options, mapping, hidden props) |
| Documentation | Generator diagnostics on the developer page | One page serves three audiences: developers, designers, and the operators of ds-sync |
| Documentation | Usage guidance, when-to-use and do/don't missing unless Figma's doc frames have them | No source; AI drafting is not yet part of the pipeline for prose |
| Developer experience | One trivial code example; no install or import context per component | Examples are derived, not planned |
| Technical quality | Stories render and are tested (630/656 pass), but grids test combinations nobody uses | Tests follow axes, not the story plan |

### 2.3 What the current pipeline can and cannot know

- **Can [verified]:**
  - every component, variant, property, layer, token binding, style, variable and mode (through the API or the plugin export);
  - behaviour from structure (button, disclosure, listbox, combobox…);
  - visual fidelity against Figma renders;
  - accessibility in every mode.
- **Cannot, from Figma alone:**
  - the code API shape: prop names, enums, separate components, events, polymorphism (`as`, `href`);
  - which variants are meaningful to developers;
  - usage guidance that the designers did not write.

  The AI layer can **propose** these from evidence, with a person accepting them. Today it does so for names and descriptions only.
- **Not connected yet:** component source code. `analyze` reads prop types, and `eval` compares them, but generation does not use them.

## 3. Research

### 3.1 Two valid structures, one shared discipline

- **Carbon [verified]:** organised **by variant**. The stories are the variants a developer picks, controls come from types, and there's a hand-written overview, with sub-components and test-only stories hidden.
- **Fluent UI v9 [verified]:** `Components/Button/Button` has an autodocs page and stories **by property**: Default, Shape, Appearance, Icon, Size, Disabled, Loading, With Long Text. It also has top-level Concepts, Theme, Motion, Utilities, Migration and Preview sections.
- **Material UI, Atlassian, Polaris, Chakra, Spectrum [knowledge]:** their public developer documentation is a custom docs site, not Storybook (Storybook is internal or secondary). They share:
  - component pages with an overview;
  - demos per use case;
  - an API page generated from types;
  - accessibility sections;
  - separate design guidance.

  Worth verifying before final standards.

The reusable principles, which none of them gets from Figma:

1. Stories are **use cases** (one per variant, property or scenario), each a working example with its code.
2. The **API comes from code types**, and controls are curated from them (options, mappings, hidden internals).
3. **Design guidance and the developer API are separated**: different sections, often different sites.
4. **Tooling detail is never on the component page.**
5. Test-only stories stay out of navigation but run in CI.

### 3.2 Storybook capabilities to use rather than rebuild [knowledge, verified where noted]

- **CSF 3 stories with `args`:** one story per use case.
- **Tags:** `autodocs` builds a docs page from stories, `dev` shows a story in the sidebar, and `test` runs it in the test runner. Carbon uses `test` without `dev` for hidden regression stories **[verified]**. Both Carbon's and our Storybook tag stories `manifest`, Storybook's component manifest, which is worth evaluating for AI and MCP consumers **[verified tag, purpose not checked]**.
- **argTypes and controls inferred from TypeScript** (react-docgen), curated with `options`, `mapping`, `control: false` and `table: { disable }` **[verified on Carbon]**.
- **`subcomponents`** for related components; **`parameters.docs.page`** for a custom overview **[verified on Carbon]**.
- **Doc blocks:** Meta, Title, Primary, Controls, ArgTypes, Stories, Canvas, Source.
- **Testing and checks:**
  - `@storybook/addon-vitest` (play functions as tests) and `addon-a11y` (axe): we use both;
  - `addon-designs` (Figma embed on a story) and Figma Code Connect (code in Figma's Dev Mode) as integrations.

**[recommendation]** Generate **good component code with complete types and JSDoc**, and let Storybook derive props tables and controls (autodocs, ArgTypes). Don't keep growing our own tables. Our job is the parts Storybook can't infer:

- the story plan;
- the argTypes curation;
- the prose;
- the overview structure.

## 4. Phase 2: what "production-ready" means (proposal)

A component's documentation is production-ready when **a developer can choose, configure and use the component correctly without opening Figma or the source**, and it passes these gates:

| Dimension | Gate (deterministic unless marked) |
| --- | --- |
| API | Every documented prop exists in the component's types; every public prop is documented; no design-tool-only props; names follow the system's conventions (decision accepted) |
| Stories | Every meaningful variant or property value is reachable in a named story; every story renders; no duplicates; test-only stories tagged out of navigation |
| Controls | Every control maps to a prop; enums are selects with the code's values; no object controls for slots or icons (a mapping instead); internals hidden |
| Overview | Purpose; when to use / not (from a source, never invented); a live example; variants explained; related components; accessibility contract; code example; theming where it applies |
| Accessibility | Role, name and keyboard contract documented; axe passes in every mode, or the issue is listed as accepted |
| Fidelity | Visual match against Figma within the threshold, or listed |
| Separation | Developer page, design reference and generation report are separate places |
| Provenance | Every sentence and API decision traceable to Figma, code or an accepted decision (with reviewer) |

**Button, as the reference example [recommendation].** The same structure applies to any design system's button; the values come from that system.

- **Sidebar:** `Components/Button` contains Overview (docs) and one story per meaningful variant, from the kinds in the API (Primary, Secondary, Tertiary, Ghost, Danger…). It adds With icon, Icon only, Disabled and, if the system has it, Skeleton. Sizes are one story with all sizes side by side. Related components (IconButton, ButtonSet) are subfolders or links.
- **Controls:** variant (select), size (select), disabled (boolean), icon (select over the icon set), label (text), href (text). Hidden: handlers, `ref`, `className`.
- **Overview sections:** purpose; live example; variants with when to use each; sizes; icons and icon-only (with the accessible-name rule); states; accessibility contract (button pattern, Enter/Space, focus ring, name required for icon-only); theming; related components; API (autodocs from types).
- **Not on the page:** Figma property mapping, nested consistency, scorecards and generator notes. They move to a design-reference page or the generation report.

## 5. Phase 3: architecture (proposal)

### 5.1 The one new layer

```
Figma (API or plugin export) ─┐
Component source (optional) ──┼─► Extraction ─► IR (exists) ─► Component Doc Spec ─► Storybook (CSF + MDX + code)
Existing docs (optional) ─────┘                     ▲                ▲                   │
                                     Reference specs (per archetype)  │                   ▼
                                     Decisions (AI-proposed, person-accepted)       Validation ─► Review ─► Deploy
```

The **Component Doc Spec** is new: a versioned, schema-checked JSON per component. It holds the developer-facing truth:

- **API:** props, types, defaults, values; props dropped as not-API; related and separate components;
- **story plan:** named stories, each with its args and a tag (`dev`, `test`);
- **controls:** per prop: control type, options, mapping, hidden;
- **documentation content:** each section's text, with its source (Figma, code, decision);
- **accessibility contract** (from the archetype).

It is built **deterministically** from:

- the IR;
- the **reference spec** for the component's archetype;
- the code's types, when code exists;
- **accepted decisions** for everything that needs judgement.

The generator then renders it: no AI writes code or stories.

### 5.2 Skills: fewer than proposed, on purpose

| Proposed | Recommendation | Why |
| --- | --- | --- |
| Design System Analyzer | **Deterministic** (exists: discover, extract, IR) | Repeatable; no judgement |
| Component Intelligence | **AI skill: interpret** (exists, extended) | Judgement: archetype, API shape (enum vs separate component, drop or keep), names, story plan proposals |
| Storybook Architect | **Deterministic**, from reference specs + accepted story plan | Information architecture must be consistent across components; rules, not prose |
| Controls Generator | **Deterministic** (from types and the spec) | Fully derivable once the API is decided |
| Documentation Generator | **AI skill: write**, sectioned and source-bound | Prose needs judgement; every sentence cites its source; a person accepts |
| Developer Documentation | Merged into the two above | Code examples come from the story plan (deterministic); prose from *write* |
| Quality Assurance | **Deterministic validators** (exist: audit, docs lint, visual, tests) + **AI skill: diagnose** (exists) for triage | Gates must be measurable; AI only explains failures |

So there are three AI skills (interpret, write, diagnose) and one review flow, all writing data into decisions, never code. One schema and one decisions file keep them consistent: no skill reads another skill's prose.

### 5.3 Reference specs (per archetype)

These are **YAML, machine-read**, extending today's `engine/archetypes/*.yaml` behaviour contracts, with a short Markdown guide for the AI skills. A Button spec holds:

- the required sections;
- the story plan rules (one story per value of the variant prop, plus icon, icon-only, disabled, sizes);
- the required controls;
- the accessibility contract;
- the validation criteria.

Systems differ in values, never in structure. An organisation can **override** a spec in its configuration (its own section order, extra sections), as long as the result still validates.

### 5.4 Where the work is

| Need | Kind |
| --- | --- |
| Component Doc Spec schema and builder | Schema + deterministic code |
| Reference specs: Button first, then input, select, checkbox, radio, switch, dialog, tooltip, tabs, table, notification, card, navigation, typography, icon | YAML + Markdown |
| Code ingestion (types → API), when code exists | Deterministic (`analyze` exists; promote it into generation) |
| Decision roles: `drop`, `component` (separate component), `enum`, `story` | Schema + interpret skill |
| *write* skill (sectioned, source-cited prose) | AI skill + validator |
| Generator renders from the spec: story plan, curated argTypes, overview MDX; diagnostics moved to a report page | Deterministic |
| Validators: API vs types, story coverage, control validity, duplicates, naming, provenance | Deterministic |
| Plugin: nothing new for docs; it already carries what Figma has | — |

## 6. Phases 4–6: structure, roadmap and pilot (draft)

### 6.1 Repository structure

Inside the existing engine, not a new product tree.

```
engine/
  standards/            production-ready definition, section order, naming rules (Markdown + YAML)
  schemas/              component-doc-spec.schema.json, decisions.schema.json (exists), reference-spec.schema.json
  references/           one YAML + one guide per archetype: button, input, select, … (grows from archetypes/)
  src/spec/             builds the Component Doc Spec from IR + references + code + decisions
  src/generate/         renders spec → CSF stories, argTypes, MDX, components (exists, refocused)
  src/validate/         docs lint, audit, API-vs-types, coverage, provenance (partly exists)
  claude-plugin/skills/ interpret (extended), write (new), diagnose, review (exist)
  examples/             the Button pilot: inputs, spec, output, report
```

Organisation configuration (section overrides, naming conventions) lives in `ds-sync.config.json` and is validated against the same schemas.

### 6.2 Roadmap

| Phase | Deliverables | Acceptance |
| --- | --- | --- |
| 1. Foundation | Spec schema; standards document; Button reference spec | Reviewed and agreed (this document's questions answered) |
| 2. Spec builder | IR + reference + decisions → spec; diagnostics moved off the developer page | Carbon Button spec matches the agreed example |
| 3. Decisions | Roles: drop, separate component, enum values, story plan; interpret skill extended | Carbon Button: `resizer` dropped, Skeleton as its own component, sizes as code values — each an accepted decision |
| 4. Generation | Stories from the story plan, curated argTypes, overview MDX from the spec | Carbon Button side by side with Carbon's: same stories and same controls, or a reason for each difference |
| 5. *write* skill | Source-cited prose for overview sections | Every sentence has a source; nothing invented; a person accepts |
| 6. Validation | API vs types, coverage, controls, provenance gates | Pilot passes all gates; failing a gate blocks the PR |
| 7. Expand | Input, select, checkbox, dialog references | Each validated on two systems before it counts |
| 8. Product | Organisation configuration, review UI or PR flow, packaging | Decided with section 7's answers |

### 6.3 Pilot: Carbon Button

Done means:

- the generated Button and Carbon's own match **story for story and control for control**, with every difference listed and justified;
- the gates in section 4 pass;
- there are no Figma internals on the developer page.

Then IconButton and ButtonSet as related components. Only then a second archetype, and the same archetype on a second system (Blade or Design System AI), before generalising.

## 7. Questions that change the architecture

Ordered by how much the answer changes the design.

1. **Do customers have component code, and is the output documentation of *their* components or of components *we generate*?** This decides whether the API comes from code types (Carbon's model) or from decisions on top of Figma. It also reverses or confirms the 18 Nov decision "Figma-only input". Carbon's Storybook, our reference, documents existing code, so comparing it with a Figma-only generator compares two different products.
2. **When Figma and code disagree, who wins, per aspect?** For example: code for API and behaviour, Figma for visuals and tokens, and a person for the rest. This sets the precedence rules in the spec builder and what the validators flag.
3. **One standard, or one per organisation?** Can a customer reorder sections, rename the information architecture or add sections? This decides whether reference specs are fixed or overridable, and how much the validators must allow.
4. **Who reviews, and where?** Engineers in pull requests, designers in a web UI, or both. This decides whether we need a hosted product with a review UI, or a CLI with a GitHub flow (today's model).
5. **May the AI write prose the sources don't contain** (usage guidance, do/don't), clearly marked as proposed, or only restate what Figma and code say? This decides the *write* skill's scope and the provenance gate.
6. **Should the tool replace a customer's existing Storybook, or add to it** (generate missing stories and docs next to hand-written ones)? Merging with existing files is a different, harder problem.
7. **React only for the product, or keep Web Components at parity?** Today both are generated; parity doubles the generation and test surface for every new feature.
8. **How is it deployed?** SaaS (we hold Figma tokens and possibly source code), self-hosted, or CLI in the customer's CI only. This decides the security model and whether a server exists at all.
9. **Who is the buyer:** a design-system team that owns a system, or product teams consuming one? This decides whether we optimise for maintaining one system deeply or onboarding many quickly.
10. **What does success look like at a sale?** Time to first Storybook, documentation completeness, or design fidelity. This decides what we measure and show first.

## 8. Decisions (24 Nov 2026)

| Question | Decision | What it changes |
| --- | --- | --- |
| 1. Input and output | **Both modes.** With the customer's code, the API comes from their types and the Storybook documents their components. Without code, ds-sync generates components from Figma, and the API comes from accepted decisions | Reverses the 18 Nov "Figma-only" decision ([REFERENCE-MODE.md](REFERENCE-MODE.md)), for the code side only. The live website stays out of scope. Code ingestion (`analyze`) moves into generation, and the spec builder takes two API sources |
| 2. Figma and code disagree | **By aspect.** Code wins for API and behaviour; Figma wins for visuals and tokens; every conflict is listed for a person | The spec builder records the source of each field, and a drift report lists the conflicts. Validators check code-mode stories against the types and Figma-mode visuals against Figma |
| 3. Standards | **Our standard, with organisation overrides** (reorder or add sections, rename groups), still validated | Reference specs get a documented override layer in the configuration; the validators check the result, not the defaults |
| 4. AI prose | **Yes, with review.** AI drafts every section from evidence; each sentence carries its source, or is marked proposed; nothing ships until accepted | The *write* skill is in scope; the provenance gate allows "proposed" only before acceptance |
| 5. Review | **Engineers, in GitHub pull requests** | No hosted review UI for the MVP. Proposals arrive as pull requests: the spec diff, the decisions with evidence, the rendered Storybook, and the validation report. Accepting means approving and merging (or `ds-sync decisions accept` in the branch). This extends today's workflow and CI loop; designers take part as PR reviewers, not in a separate tool |
| 6. Existing Storybook | **Most customers have none: generate a new Storybook** (the MVP case). Where one exists, the job is to **modify it**: apply the engine's improvements to their stories and docs, as pull requests, without replacing their work | MVP: ds-sync owns the Storybook it generates (today's model: generated folders are rebuilt on every run). Later release: an *enhance* mode that reads an existing Storybook (its CSF files, MDX, argTypes) into the spec, proposes changes to it as reviewable pull requests (missing stories, controls, sections, accessibility fixes), and never overwrites hand-written content without review. The spec format must therefore be able to describe an existing Storybook, not only one ds-sync generated |
| 7. Frameworks | **React first; Web Components later** | New documentation-engine features (spec, story plans, curated argTypes, overview MDX, *write*) are built and gated for React only. The Web Components target keeps working as it is, without the new features, until React's pilot and first archetypes pass; then it catches up from the same spec, which stays framework-neutral |
| 8. Deployment | **CLI in the customer's CI** (and on developer machines) | No server of ours: Figma tokens, plugin exports and source code stay in the customer's repository and runners. AI runs with the customer's own Claude Code login or API key, or is turned off. Distribution is the npm package plus the GitHub workflow template; licensing, if any, is enforced in the CLI. A hosted service is not in the MVP |
| 9. Buyer | **Design-system teams** | Optimise for maintaining one system deeply over time: fidelity measurement, drift between Figma and code, the decisions audit trail, review in pull requests, incremental regeneration and change summaries. Onboarding speed matters, but completeness and correctness matter more than a fast first result |
| 10. Success | **Documentation completeness, and 100% accuracy to what Figma specifies.** "100%" is defined measurably: every Figma component, variant, property, value, token binding and documentation frame is present in the Storybook and verified by a check, and every visual difference beyond the rendering threshold (2% of pixels, size within 1 px) is either fixed or listed with its cause. Pixel-identical output is not the definition: browsers and Figma rasterise text and edges differently. A gate fails on any unlisted difference | The completeness and fidelity gates become release-blocking per component, reported per measure (no averaged score). Today's measures (variants, properties, nested consistency, tokens, visual) are the base; the spec adds API, stories, controls and provenance |

All ten questions are answered.

## 9. Status (25 Nov 2026)

| Phase | Status |
| --- | --- |
| 1. Foundation | Done: `engine/standards/production-ready.md`, `schemas/component-doc-spec.schema.json`, 24 reference specs in `engine/references/` |
| 2. Spec builder | Done: a doc spec and coverage check for every component of every system (`docspec/`, `DOCS-COVERAGE.md`). Diagnostics moved to a Design review page per component |
| 3. Decisions | Partly done: `role: internal` (Carbon Button's Resizer) and value names. Separate components such as Skeleton come from code mode (`<ButtonSkeleton>`); there is no decision role for them yet |
| 4. Generation | Done for the pilot: per-value and per-state stories, and code mode (`generate.code`, the `react-code` target). See docs/pilots/carbon-button.md |
| 5. *write* skill | Built: evidence packs, the write-usage skill, `ds-sync usage`, cited-source checks, and the Usage section. Piloted on Carbon Button (draft, not yet accepted). The other components still need drafting and review |
| 6. Validation | Done: `ds-sync docs check` against a reviewed baseline, in the GitHub workflow |
| 7. Expand | Coverage runs on every component already. Each reference spec still needs checking on two systems |
| 8. Product | Not started |
