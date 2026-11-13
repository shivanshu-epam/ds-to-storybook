# Figma to Storybook: project plan

_Last updated 2026-11-12 (Phases A and B delivered)._

## 1. Goal

Build a **generic tool** that takes any organisation's Figma design system and produces a production-ready Storybook in the team's own tech stack. It should then keep the Storybook in sync as Figma changes, through reviewed pull requests.

The full product strategy (market research, architecture options, security, KPIs) is in the strategy doc: *Figma-to-Storybook AI: Technical Strategy* (claude.ai artifact).

## 2. Principles agreed so far

1. **Deterministic core, AI only for judgement.** Reading Figma, tokens, styles, stories, tests and diffs are code. AI is used only to classify ambiguous frames, interpret doc text, map unclear names, and edit existing code.
2. **Figma is the source for looks; standard patterns are the source for behaviour.** Keyboard, focus and ARIA come from WAI-ARIA patterns (archetypes), never invented. Anything Figma does not specify is listed as a gap or an assumption.
3. **Validate before trusting.** Every story is a test: render, interactions and axe accessibility. Output is compared visually with Figma renders.
4. **Show the full code API.** Props that exist in code but not in Figma are documented as code-only, not hidden.
5. **Changes reach code only as pull requests**, and nothing merges without review.
6. **Secrets never enter the repo.** The Figma token lives in `engine/.env`, which git ignores.

## 3. What exists today

| Area | Status | Where |
| --- | --- | --- |
| Strategy (20 chapters, research, roadmap) | Done | Strategy doc |
| Figma extraction: REST client with cache and rate-limit retries, normalized IR | Done | `engine/src/figma`, `engine/src/ir` |
| Component specs: props, states, variant matrix, anatomy, token binding, gaps | Done | `engine/src/spec` |
| Drift report against an existing repo (Scenario 5) | Done, React only | `engine/src/code`, `engine/src/diff`, `engine/src/report` |
| **Storybook generation from Figma (Scenario 2)** | **Done for every component set (21 components)** | `engine/src/generate` → `storybook/` |
| Tokens: Figma variables to CSS, light/dark and brand modes | Done | `storybook/src/tokens/tokens.css` |
| Generated components: 9 with behaviour templates (Button, Checkbox, Accordion, Switch, RadioControl, RadioField, RadioGroup, Input, Dialog), 18 generic; stories, MDX docs, 42 icons | Done; 306/306 story tests pass across all Figma modes (27 components; design contrast issues accepted per mode) | `storybook/src/components` |
| Discovery, `init`, installable CLI, Claude Skill, GitHub workflow, Figma plugin | Done (Phases A and B) | `engine/`, `skills/`, `plugin/` |
| Engine tests | 64/64 pass | `engine/test` |

**Figma file:** "Design system AI" (`I983NcgqSiY14YkpJbwjG8`). The variables come from `engine/inputs/figma-variables.json`, because the Variables REST API is Enterprise-only.

**How generation works:**

1. **Extract:** Figma becomes the IR.
2. **Tokens:** Figma bindings are matched to semantic tokens by value and property hint.
3. **Styles:** for each property, the engine finds the smallest set of axes it depends on, which gives compact CSS.
4. **Archetype templates:** they produce the components, stories (matrix, axes, slots, play tests) and docs (Figma text verbatim).
5. **Report:** `GENERATION-REPORT.md` and `token-map.json` record the decisions.

## 4. Known gaps (why it is not yet a generic tool)

| # | Gap | Impact |
| --- | --- | --- |
| G1 | ~~Component pages and node ids are listed by hand~~ **Fixed in Phase A** (auto-discovery) | — |
| G2 | Only 3 behaviour templates; the rest use the generic template (visuals only) | Interactive components need behaviour before production |
| G3 | ~~Output stack is fixed to React~~ **Fixed in Phase C**: Web Components for any framework, React kept | Native Vue/Angular output and Tailwind styling not offered |
| G4 | ~~No packaging~~ **Fixed in Phase B** (init, package, skill, workflow); npm publishing still open | — |
| G5 | Tests run in light mode only; no automated visual diff against Figma | Dark-mode and visual regressions are caught only by eye |
| G6 | No sync: a Figma change is not turned into a pull request | One-shot generation only |
| G7 | ~~Variables need a manual export~~ **Fixed in Phase B** (Figma plugin; the API is used on Enterprise) | Plugin untested in Figma |
| G8 | Some decisions are open: icon-only buttons (accessible name), spacing between accordion items | Listed in the generation report |

## 5. Roadmap

Each phase ends with something usable. The team is assumed to be 1 frontend engineer, 1 backend/AI engineer and 1 designer; estimates include buffer.

### Phase A: works on any Figma file (about 3 weeks). Fixes G1 and G2 partly.

- [x] Auto-discover component sets on every page, including nested ones; no ids in config (`ds-sync discover`).
- [x] Classify frames as documentation, example, page text or other by rules and content profile. Low-confidence results are listed for a person to confirm. (AI classification is not used yet; the Claude Skill asks the person instead.)
- [x] Generic template: any component set becomes a styled component with its variant, boolean and text props, icons, and nested components with their overrides, plus matrix and axis stories. Its behaviour is marked "not specified".
- [x] Choose the template by rules (names and layer structure), with overrides in config.
- [x] **Second, unseen design system: Blade** (Razorpay's design system, community copy; 2026-11-13). Installed from the packed npm tarball in an empty folder, as a new team would.
  - Discovery first found 11 of Blade's component sets: Blade keeps each set six levels inside a page frame, beyond the depth-2 read and Figma's set list. Discovery now reads non-documentation frames breadth-first, again where Figma cut them off at the depth limit (up to four rounds): **108 sets on 43 pages**. Internal pages (`_…`), deprecation pages and sets named DEPRECATED / DO NOT USE / Old are left out. Cost on Blade: 4,744 frames, about 25 minutes the first time (Figma's rate limit), seconds when cached.
  - Extraction now fetches deeply nested sets by id. The same scan also found 6 sets in the first design system that had always been missed (Dropdown, DropdownMenu, DropdownTrigger, Form, InputControl, InputField).
  - Generalisations Blade forced: True/False variant properties are booleans (`isChecked?: boolean`), and `isDisabled` is the disabled state; icons are recognised by shape (a small square standalone component made of shapes), not only by an "Icon/" name; each repeated instance keeps its own toggle; hidden copies are skipped; icons inside shape groups render; input properties that clash with native attributes (`value`) are renamed; dialog behaviour only for sets named Dialog/Modal/Drawer.
  - Result: **108 components in both outputs, both typecheck**. Story tests: 257 of 405 pass; all 148 failures are colour contrast in Blade's design (mostly helper text `#768ea7` on white, 3.38:1). No render or interaction failures. Visual sample (10 components, 268 variants): Badge 35/36 and Indicator 30/30 match; Checkbox, Switch, Spinner and Tag differ (focus rings drawn as separate components, icons swapped through instance properties). Tokens stay raw: Blade's variables need the plugin export.
  - Not yet for Blade: behaviour templates for its naming (Checkbox/CheckboxBase/CheckboxGroup, a 600-variant Button, AccordionItem with isExpanded), and remembering set locations so CI does not repeat the deep scan.
- **Done when:** a second, unseen Figma design system generates a Storybook in which every component set has stories, and the report lists every gap. **Met with Blade** (behaviour coverage for its naming is the next improvement).

### Phase B: a tool anyone can run (about 2 weeks). Fixes G4 and G7.

- [x] `ds-sync init`: Figma link, token check, variables check, stack detection, config, `.gitignore` entries.
- [x] Installable package (`npm pack` / `npm link`, compiled to JavaScript). Tested from a clean folder: init, then generate, then `npm install`, then 78 of 79 tests pass. **Ready to publish as `ds-sync` (MIT)**: metadata, licence, npm-facing README, `npm pack` checked (44 files, 134 kB, no sources or secrets), and `.github/workflows/release.yml` publishes on a `v*` tag with provenance (npm trusted publishing or an `NPM_TOKEN` secret). The first publish needs the owner's npm account.
- [x] **Claude Skill** `skills/figma-to-storybook`: runs the CLI, asks the review questions, records the answers as overrides, and explains failures and gaps.
- [x] GitHub Action template (`ds-sync init --ci`): regenerates weekly or on demand, runs the tests, opens a pull request. The same steps were dry-run locally from fresh GitHub clones: identical output, typecheck passes, 78/79 tests. It is installed in this repo as `.github/workflows/ds-sync.yml` and **ran successfully on GitHub** (run 43244288117): generate, then test, with no pull request because Figma had not changed. The first runs surfaced, and drove fixes for, a missing secret check, lockfile noise and transient Figma 500 errors.
- [x] Figma plugin `plugin/` that exports variables for non-Enterprise plans. Its export logic was run against the real file through the Figma Plugin API: it matches the existing export and finds 12 more collections. **The Download/Copy UI has not been clicked in Figma.**
- [x] `overrides.knownIssues`: accept a design issue (its axe check becomes a warning) with a recorded reason.
- **Done when:** a new user goes from a Figma link to a running Storybook with no help from us.

### Phase C: tech stack support. Done 2026-11-12 (G3).

Decision: support every stack through **layers**, as multi-framework design systems do, rather than one adapter per framework.

- [x] Platform-neutral tokens for every target: CSS custom properties, W3C DTCG JSON, typed TypeScript.
- [x] **`web-components` target:** Lit custom elements in Shadow DOM, reusing each template's model, so the CSS is byte-identical to the React output. Button and Checkbox are form-associated, with focus delegation and composed events. React JSX typings are included (checked against @types/react), and each docs page has usage snippets for HTML, React, Vue, Angular and Svelte.
- [x] `react` target kept for React teams that want idiomatic React.
- [x] Several targets in one run (`generate.targets`); the GitHub workflow tests and commits every target folder.
- [x] `init` detects the framework, styling, package manager and monorepo, and suggests the target: React → `react`; Vue, Angular, Svelte, Lit or none → `web-components`; React monorepo → both. Overridable with `--target`.
- **Verified:** the Web Components example passes 78/79 story tests, the same as React (1 real design contrast issue). Button, Checkbox, Accordion and Alert are visually identical to React. A clean Vue project ran init, then generate, then tests, and got Web Components automatically.
- **Not yet verified:**
  - running the custom elements inside real Vue, Angular and Svelte apps (the docs snippets follow each framework's documented custom-element setup);
  - Tab order inside Shadow DOM, which the test library cannot simulate, so keyboard tests focus elements directly.
- **Later, if teams ask:** native Vue or Angular output (thin wrappers over the Web Components are the likely route), and Tailwind as a styling option.

### Phase D: more components and stronger checks (ongoing). Fixes G2, G5 and G8.

- [x] **Switch** (2026-11-12): a behaviour pack on the generic template. Any set named switch/toggle with an on/off variant axis gets a native button with `role="switch"` and `aria-checked`, controlled or uncontrolled state, Space/Enter toggling, disabled and loading (`aria-busy`) handling, and a focus ring from the focus token when Figma has none. The Web Component is form-associated. Play tests cover click, Space, disabled and loading. Both examples now pass 80/81.
- [x] **Radio** (2026-11-13): three behaviour packs, found by discovery from a Radio Control/Field/Group family with a selected axis.
  - Control: a native radio input over the Figma visuals; the selected style is driven by `:checked`, the focus style by the input's `:focus-visible`.
  - Field: the row holding the radio and its text becomes a `<label>`; `label`, `name`, `value`, `checked` and `onChange` pass to the radio.
  - Group: `role="radiogroup"` named by the group label, with `name`, `value`/`defaultValue` and `onValueChange` shared through context, and `children` replacing the Figma example items.
  - Web Components: native radios cannot group across shadow roots, so the group collects its radios from a composed event and does the grouping itself (one selected, arrow keys, one Tab stop).
  - Repeated instances (the three example items in the Figma group) now render once each instead of being merged into one.
  - Both examples pass 81/82; play tests cover click, label click, disabled, and arrow-key selection.
- [x] **Input** (2026-11-13): any set named input/text field with a Placeholder text property. Layers are found by the Figma properties bound to them:
  - the placeholder text layer becomes a native `<input>` (placeholder from Figma; typed text uses the `text/primary` token, since Figma only draws the placeholder);
  - the Label layer becomes its `<label>`, the helper text its description (`aria-describedby`), the Required layer sets `required`, a Clearable icon becomes a "Clear" button, and the character count is live when `maxLength` is set;
  - State=Error sets `aria-invalid`; the Figma Type axis is `appearance`, so `type` stays the native input type;
  - the Web Component is form-associated (value, required validity) with the input and label in one shadow root.
  - Note: axe does not check `::placeholder` contrast, so the Input placeholder issue accepted in `knownIssues` is no longer measured by the tests. It is still a design issue.
- [x] **Dialog** (2026-11-13): any set named dialog or modal, on the native `<dialog>` element.
  - Modal by default (`showModal()`): focus moves in and stays in, the page behind is inert, the backdrop uses the `overlay/default` token, and focus returns to the opener on close. Escape closes modal and in-page dialogs.
  - The title layer names it, the body describes it, Type=Alert is `role="alertdialog"`, State=Loading sets `aria-busy`, and the close icon is a "Close" button.
  - `open` / `defaultOpen` / `modal` / `onOpenChange`; `children` replaces the Figma body and `footer` the Figma buttons, which have no actions (listed as a gap).
  - Web Component: the `<dialog>` lives in the shadow root, with a default slot (body), a `footer` slot, and composed `open-change` events.
  - Generator fix found here: a layer bound to a boolean property was shown in variants that do not have it at all (an oversized close icon on Alert dialogs). It is now hidden there; this also corrects Badge (numeric and dot have no icons), BreadcrumbItem and ListItem (skeleton).
- [ ] Archetypes: select/dropdown, tabs, tooltip, toast, slider, table. None of these is in the current Figma file.
- [x] **Tests in every Figma mode** (2026-11-13): every story runs once with the default modes and once per other mode (here theme=dark and project=project-b), as separate Vitest projects, so axe checks contrast in each theme. `npx vitest run --project "storybook (theme: dark)"` runs one mode.
  - Result, identical in React and Web Components: 200 of 246 pass. All 46 failures are colour contrast in the design tokens, not generator bugs:
    - default modes: 1 (Input placeholder, 4.39:1, known);
    - brand B (project-b): 22, because orange `#e46b00` with white text is 3.28:1 and on light grey 2.98–3.13:1 (Button, Dialog, Avatar, Breadcrumb, Alert, ListItem, Input);
    - dark theme: 23, because dark text `#111827` sits on mid-tone avatar and badge colours (1.72–3.97:1) and grey `#6b7280` text on dark surfaces is 3.66–4.16:1 (Badge, Avatar, Checkbox, DatePicker, Dialog, Input, ListItem).
  - **Accepted for now (2026-11-13)**, per mode: `overrides.knownIssues` in `ds-sync.config.json` lists each component, mode and measured contrast. In those modes axe reports instead of failing; every other mode stays strict. The Input placeholder contrast in the default modes (4.39:1) was accepted the same way. Result: all 246 story tests pass in both outputs.
  - To do in Figma: a darker brand B orange, and lighter or darker text for dark-theme badges, avatars and grey helper text. Remove each entry from `knownIssues` once its tokens are fixed.
- [x] **Visual comparison against Figma** (2026-11-13): `ds-sync visual` compares every Figma variant (Figma's own PNG, from the generated version) with the same variant in the running React Storybook ("Figma Variants" story per component), pixel by pixel, and writes `.ds-sync/visual/report.html`.
  - Coverage: all 21 components, 1,340 variants (Button, Checkbox and Accordion added 2026-11-13).
  - First run: 516 match, 162 close, 356 differ. It found real generator bugs, now fixed: repeated layers with one name were merged (the Form dialog's second field, the Range date picker's second field, calendar days); nested components painted their fill and border twice; layers Figma reorders per variant (Position=Right, an error banner shown first) kept one order; dashed and dotted strokes were solid; gradient fills were dropped; text and icons Figma swaps per variant (button labels, Loading spinners, the Switch check/cross, the Separator chevron) always showed the default; single-line text was up to 1px shorter than Figma's rounded text boxes; a layer that is text in one variant and an icon in another showed only one.
  - Now: **910 match** (≤ 2% and the same size), **358 close** (≤ 7%: text anti-aliasing between Figma and Chromium; Button labels 1px narrower because Figma rounds text boxes up; Figma's fixed-size specimen frames around content that sizes itself, such as 320px checkbox fields), **72 differ**: all 1px dashed Divider lines, where Chromium snaps the half-pixel stroke differently (they look the same).
  - Also found and fixed for Checkbox: fields and groups use the checkbox size nested in Figma's field (Medium), and the group's legend now takes part in the layout gap (a fieldset keeps a plain legend out of flex).
  - Not yet: running it in CI (it needs a running Storybook).
- [ ] Resolve the open decisions in G8 with the design system team.

### Fidelity phase (started 2026-11-13)

A production-grade Storybook where Figma, generated code and documentation stay aligned. Audit, standard, quality framework, documentation-skill specification and roadmap: [docs/fidelity/](docs/fidelity/README.md). Key audit results on Blade: nested components ignore parent configuration (109 of 332 nested layers) and Figma's exposed nested instances (32 sets); shapes drawn as boxes cause the "highlighted" Accordion icon; ActionListItem's red rows are Figma's destructive variants; docs pages expose raw Figma names and stray "…Props" stories. Implementation starts with the nested instance model (roadmap steps 1–4) after review.

### Phase E: keep it in sync (about 4 weeks). Fixes G6.

- [x] **Polling** (2026-11-13): the workflow runs every weekday and first asks Figma for the file version (`ds-sync status`, one API call). If it did not move, the run stops there. A version that only moved the version number is remembered (Actions cache, keyed by Figma version, engine version and config), so later runs also stop after that one call. (A Figma webhook would need a hosted receiver; polling needs nothing.)
- [x] **What changed in Figma** (2026-11-13): `ds-sync changes` (and `generate`, when the output came from an older version) reads Figma at the generated version and at the new one and lists, per component: properties and options added, removed or with a new default; variants added or removed; colour, stroke, radius, padding, gap, size, font, text and icon changes (grouped: "3 of 90 variants"); documentation frames added, removed or edited. Written to `.ds-sync/changes.md`, used as the pull request description, with labels by kind (`component-api`, `components`, `styles`, `content`, `docs`). Tried on real history: September → November finds the removed Checkbox Skeleton state (3 variants) and a removed "Specs" docs frame on every component.
- [x] **Before/after renders**: Figma's own renders of the changed variants at both versions, side by side (`.ds-sync/changes/changes.html`, up to 40 variants), attached to the workflow run with the visual report.
- [x] **Visual check in CI**: the workflow builds the React Storybook, serves it, runs `ds-sync visual`, puts the counts in the pull request and the report in the run's artifacts.
- [ ] Three-way diff against code people edited by hand (only relevant once teams edit generated code; today the generated folders are owned by ds-sync).
- [x] **Proven end to end (2026-11-12):** a one-variant colour and radius edit in Figma became [pull request #1](https://github.com/shivanshu-epam/ds-to-storybook/pull/1) through the GitHub workflow: 4 files, including a 5-line CSS override for exactly that variant.
- [x] No pull request for a new Figma version with no design change: the workflow ignores lines that only record the version, then skips the tests and the pull request.
- [x] One pull request per Figma update, labelled by change type, with the change summary and before/after renders. (Separate pull requests per type were not worth the extra review overhead: labels give the same triage.)
- [ ] Update existing repos (Scenario 1), not just new ones.

### Phase F: enterprise (later)

Hosted control plane, multiple design systems and repos, role-based access, audit log, self-hosting, GitLab and GitHub Enterprise Server.

## 6. Decisions needed

1. ~~Which tech stacks first?~~ Answered: support any stack. Web Components (any framework) plus native React.
2. ~~Which second Figma design system?~~ Answered: Blade (community copy).
3. **Where does the tool run?** As an npm package plus a GitHub Action (recommended first), a hosted service, or both.
4. **Which AI model or provider is allowed** for the judgement steps, and is a no-AI mode required?
5. **Is the repo public or private?** It is currently public and contains Figma documentation text and tokens.

## 7. Immediate next steps

1. Close Phase A and B checks:
   - run against a second Figma file;
   - run the plugin in Figma;
   - run the GitHub workflow once;
   - decide on npm publishing (name, scope, public or private registry).
2. ~~Phase C~~ done: Web Components for any stack, React kept.
3. Phase D: behaviour templates for the components now on the generic template (switch, radio, input and dialog done; the rest when a design system has them), and dark-mode test runs.
