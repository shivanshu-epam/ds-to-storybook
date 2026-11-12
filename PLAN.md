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
| Generated components: 3 with behaviour templates, 18 generic; stories, MDX docs, 42 icons | Done; 78/79 story tests pass (1 real design contrast issue) | `storybook/src/components` |
| Discovery, `init`, installable CLI, Claude Skill, GitHub workflow, Figma plugin | Done (Phases A and B) | `engine/`, `skills/`, `plugin/` |
| Engine tests | 23/23 pass | `engine/test` |

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
| G3 | Output stack is fixed: React 19, TypeScript, CSS Modules, Storybook 10, Vite | Teams on Vue, Angular, Tailwind and others cannot use it |
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
- [x] GitHub Action template (`ds-sync init --ci`): regenerates weekly or on demand, runs the tests, opens a pull request. The same steps were dry-run locally from fresh GitHub clones: identical output, typecheck passes, 78/79 tests. It is installed in this repo as `.github/workflows/ds-sync.yml`. **Not yet run on GitHub** (needs the `FIGMA_TOKEN` secret).
- [x] Figma plugin `plugin/` that exports variables for non-Enterprise plans. Its export logic was run against the real file through the Figma Plugin API: it matches the existing export and finds 12 more collections. **The Download/Copy UI has not been clicked in Figma.**
- [x] `overrides.knownIssues`: accept a design issue (its axe check becomes a warning) with a recorded reason.
- **Done when:** a new user goes from a Figma link to a running Storybook with no help from us.

### Phase C: tech stack support (about 3 weeks per stack). Fixes G3.

- [ ] Stack detection: framework, styling system, package manager, monorepo, Storybook version.
- [ ] A per-stack output layer behind one interface. The order depends on what target teams use; the candidates are React + Tailwind, Vue 3, Angular and Web Components.
- [ ] Use the headless library the stack already has (React Aria, Radix, Angular CDK, and so on) for behaviour.
- **Done when:** the same Figma file generates a passing Storybook in two stacks.

### Phase D: more components and stronger checks (ongoing). Fixes G2, G5 and G8.

- [ ] Archetypes: input, select/dropdown, dialog, tabs, tooltip, toast, radio, switch, slider, table.
- [ ] Run the tests in every Figma mode (light, dark, brands).
- [ ] Visual comparison against Figma renders: element positions, computed styles, then a perceptual score.
- [ ] Resolve the open decisions in G8 with the design system team.

### Phase E: keep it in sync (about 4 weeks). Fixes G6.

- [ ] Figma webhook (library publish) or polling, then re-extract only what changed.
- [ ] Three-way diff (last accepted spec, new Figma, current code), then the smallest change set.
- [ ] Open a pull request per change type (tokens / styles / API / stories) with before/after images.
- [ ] Update existing repos (Scenario 1), not just new ones.

### Phase F: enterprise (later)

Hosted control plane, multiple design systems and repos, role-based access, audit log, self-hosting, GitLab and GitHub Enterprise Server.

## 6. Decisions needed

1. **Which tech stacks first?** This sets the order of Phase C.
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
2. Phase C, tech stack support: needs decision 1 (which stack first).
3. Phase D: behaviour templates for the components now on the generic template (input, radio, switch, dialog first), and dark-mode test runs.
