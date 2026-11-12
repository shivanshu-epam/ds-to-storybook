# Figma to Storybook: project plan

_Last updated 2026-11-12._

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
| **Storybook generation from Figma (Scenario 2)** | **Done for 3 components** | `engine/src/generate` → `storybook/` |
| Tokens: Figma variables to CSS, light/dark and brand modes | Done | `storybook/src/tokens/tokens.css` |
| Generated Button, Checkbox (+ Group), Accordion with stories, MDX docs and icons | Done; 24/24 story tests pass | `storybook/src/components` |
| Engine tests | 19/19 pass | `engine/test` |

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
| G1 | Component pages and node ids are listed by hand in `ds-sync.config.json` | Does not work on a new Figma file without manual setup |
| G2 | Only 3 templates (action, checkbox, disclosure) | Any other component is not generated |
| G3 | Output stack is fixed: React 19, TypeScript, CSS Modules, Storybook 10, Vite | Teams on Vue, Angular, Tailwind and others cannot use it |
| G4 | No packaging: no `init`, no Claude Skill, no CI job | It needs someone to run the engine by hand |
| G5 | Tests run in light mode only; no automated visual diff against Figma | Dark-mode and visual regressions are caught only by eye |
| G6 | No sync: a Figma change is not turned into a pull request | One-shot generation only |
| G7 | Variables come from an exported file on non-Enterprise plans | Needs a plugin exporter to be self-serve |
| G8 | Some decisions are open: icon-only buttons (accessible name), spacing between accordion items | Listed in the generation report |

## 5. Roadmap

Each phase ends with something usable. The team is assumed to be 1 frontend engineer, 1 backend/AI engineer and 1 designer; estimates include buffer.

### Phase A: works on any Figma file (about 3 weeks). Fixes G1 and G2 partly.

- [ ] Auto-discover component sets on every page; no ids in config.
- [ ] Classify frames as component, documentation, example or other: rules first, AI only for the unclear ones, and the user confirms low-confidence results.
- [ ] Generic fallback template: any component set becomes a styled component with its variant props and a variant matrix story. Its behaviour is marked "not specified".
- [ ] Choose the archetype by rules (names, structure), with a human check.
- **Done when:** a second, unseen Figma design system generates a Storybook in which every component set has stories, and the report lists every gap.

### Phase B: a tool anyone can run (about 2 weeks). Fixes G4 and G7.

- [ ] `npx ds-sync init`: asks for the Figma URL and token, detects the stack, writes the config.
- [ ] `npx ds-sync generate` and `npx ds-sync report` as a published package.
- [ ] A **Claude Skill** (`SKILL.md` + scripts) that runs the engine, asks the judgement questions, and summarises the report. The skill is a thin wrapper; the engine does the work.
- [ ] A GitHub Action that runs `report` on a schedule and `generate` on demand.
- [ ] A small Figma plugin that exports variables for non-Enterprise plans.
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

1. Phase A: auto-discovery and the fallback template.
2. Phase B: `init`, packaging and the Claude Skill.
3. Answer the decisions in section 6, so Phase C can start.
