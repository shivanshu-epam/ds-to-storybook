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
| Generated components: 7 with behaviour templates (Button, Checkbox, Accordion, Switch, RadioControl, RadioField, RadioGroup), 14 generic; stories, MDX docs, 42 icons | Done; 81/82 story tests pass (1 real design contrast issue) | `storybook/src/components` |
| Discovery, `init`, installable CLI, Claude Skill, GitHub workflow, Figma plugin | Done (Phases A and B) | `engine/`, `skills/`, `plugin/` |
| Engine tests | 42/42 pass | `engine/test` |

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
- [ ] Run against a second, unseen Figma design system. Only "Design system AI" has been tested so far.
- **Done when:** a second, unseen Figma design system generates a Storybook in which every component set has stories, and the report lists every gap.

### Phase B: a tool anyone can run (about 2 weeks). Fixes G4 and G7.

- [x] `ds-sync init`: Figma link, token check, variables check, stack detection, config, `.gitignore` entries.
- [x] Installable package (`npm pack` / `npm link`, compiled to JavaScript). Tested from a clean folder: init, then generate, then `npm install`, then 78 of 79 tests pass. **Not yet published to npm.**
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
- [ ] Archetypes: input, select/dropdown, dialog, tabs, tooltip, toast, slider, table. Input next.
- [ ] Run the tests in every Figma mode (light, dark, brands).
- [ ] Visual comparison against Figma renders: element positions, computed styles, then a perceptual score.
- [ ] Resolve the open decisions in G8 with the design system team.

### Phase E: keep it in sync (about 4 weeks). Fixes G6.

- [ ] Figma webhook (library publish) or polling, then re-extract only what changed.
- [ ] Three-way diff (last accepted spec, new Figma, current code), then the smallest change set.
- [x] **Proven end to end (2026-11-12):** a one-variant colour and radius edit in Figma became [pull request #1](https://github.com/shivanshu-epam/ds-to-storybook/pull/1) through the GitHub workflow: 4 files, including a 5-line CSS override for exactly that variant.
- [x] No pull request for a new Figma version with no design change: the workflow ignores lines that only record the version, then skips the tests and the pull request.
- [ ] Open a pull request per change type (tokens / styles / API / stories) with before/after images.
- [ ] Update existing repos (Scenario 1), not just new ones.

### Phase F: enterprise (later)

Hosted control plane, multiple design systems and repos, role-based access, audit log, self-hosting, GitLab and GitHub Enterprise Server.

## 6. Decisions needed

1. ~~Which tech stacks first?~~ Answered: support any stack. Web Components (any framework) plus native React.
2. **Which second Figma design system** do we test Phase A against?
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
3. Phase D: behaviour templates for the components now on the generic template (switch and radio done; input and dialog next), and dark-mode test runs.
