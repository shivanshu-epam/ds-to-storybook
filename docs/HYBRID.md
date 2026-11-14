# ds-sync: Blade benchmark and the hybrid AI architecture

Date: 13 Nov 2026. This document compares three things for the Blade design system: its Figma file (the source), its real Storybook at blade.razorpay.com together with its public code (the benchmark), and the Storybook ds-sync generates from that Figma file (ours). It then decides how AI fits into ds-sync and which parts stay deterministic. Every number below was measured. The scripts and the commands to reproduce them are listed in section 9.

It does not repeat existing documents: [ARCHITECTURE.md](../ARCHITECTURE.md) covers the engine, [STRATEGY.md](STRATEGY.md) covers market research and the original options, and [fidelity/](fidelity/) covers the audit, the documentation standard, the quality measures and the roadmap.

## 1. Summary

- **What ds-sync already reproduces well** is what Figma specifies:
  - variants, nested components (23,147 of 23,147 nested values consistent), tokens per Figma mode, icons, shapes and fonts;
  - visuals: 50% of sampled variants match pixel for pixel, 60% without Divider, which does not render;
  - 259 of 405 story tests pass, and every failure is colour contrast in Blade's own palette.
- **What the real Blade Storybook has that Figma does not:**
  - a component API designed by engineers: compound components, controlled and uncontrolled state, callbacks, styled props, analytics attributes, deprecations;
  - written guidance, interaction tests, patterns and recipes.
  - Measured on 27 components that exist in both, only **34% of Blade's configuration props have the same name in ours** (66 of 197). Our 215 props carry Figma conventions (`showLeadingIcon`, `screenSize`, `state`, `isIntermediate`) instead of code conventions (`icon`, responsive props, CSS states, `isIndeterminate`).
- **Disagreement 1: "exactly like blade.razorpay.com" cannot be the target.** That Storybook was not generated from Figma, and about two thirds of its API is not in Figma at all. The target should be:
  1. 100% of what Figma specifies, measured and gated;
  2. code-quality API and documentation proposed by AI from evidence, and accepted by a person;
  3. when a team has existing code, that code as a second source.
- **Decision.** AI writes *decisions* (data), never components (code). Here is how the pieces fit:
  - **Deterministic engine:** the existing TypeScript CLI keeps every step that must be repeatable.
  - **AI work list:** a new `ds-sync review` writes the questions that need judgement, with evidence.
  - **Claude:** a Claude Code plugin (skills, one subagent, one validation hook) answers them into a schema-checked `ds-sync.decisions.json`. Claude runs either interactively or headless through `claude -p` from the CLI and GitHub Actions.
  - **Generator and validation:** the generator applies only accepted decisions, and validation measures the result.
  - **AI is optional.** Without it, everything works as today.
- **Blade becomes our evaluation set.** We give the AI only Blade's Figma data and score its proposals against Blade's real code, which it never sees. That turns "how accurate is the AI layer" into a number.

## 2. Benchmark: how the real Blade Storybook is built

Observed in the published Storybook (`/index.json`, docs pages) and the public repository `razorpay/blade`.

| Area | What Blade does | Adopt? |
| --- | --- | --- |
| Information architecture | 1,367 entries (143 docs pages, 1,224 stories). Groups: Guides (13 pages: install, theming, choosing components, AI agents, component status), Tokens (7: typography, elevation, border, spacing, breakpoints, motion, theme), Utils, Components (about 85), Patterns (7), Motion, Recipes. | Yes: foundations and guides pages next to components. Patterns and recipes are product work, not generated. |
| Component docs page | Description, "Released in", **View on Figma**, **API Decisions** link, imports, a live example with controls, a properties table with **descriptions and defaults from JSDoc**, then usage stories. Styled props hidden in a collapsible group. | Yes. We already link Figma and have the properties table. The missing parts are prop descriptions and defaults, written in plain words. |
| Stories | Usage scenarios ("With Icons", "Controlled Example", "Multiple Accordion Composition"), not one story per Figma variant. A separate **KitchenSink** group (63) shows all variants; **Interaction Tests** (121 stories with play functions) are separate from docs. | Yes: we already hide variant grids and test stories; add scenario stories only where they come from Figma examples or accepted decisions. |
| Component API | Compound components (`Accordion` > `AccordionItem` > `AccordionItemHeader`, `AccordionItemBody`), `expandedIndex`, `defaultExpandedIndex`, `onExpandChange`, `showNumberPrefix`, `icon` as a component prop, `StyledPropsBlade`, `testID`, analytics attributes, deprecated APIs kept with migration notes. | Partly. Compound components and controlled/uncontrolled pairs, yes (roadmap step 5, step 11). Styled props, analytics and React Native are product decisions, out of scope. |
| Design decisions | Every component has `_decisions/decisions.md`: API proposal, Figma link, interaction videos, accessibility notes, written by an engineer before implementation. | Yes, as the *output* of the AI layer: our decisions file is the machine-readable version of this practice. |
| Engineering | Storybook with `react-vite`, `addon-docs`, `addon-a11y`; `test-storybook` interaction runner in CI; Jest unit, SSR and native tests with snapshots; tokens published as a package entry point; web and native builds. Visual regression service not verified. | We already run story tests, axe in every mode and a Figma visual check. SSR and native: not needed. |
| AI | Blade ships a **Claude Code plugin** (`packages/blade-plugin`: one `blade` skill with per-component reference docs, a SessionStart hook, also packaged for Codex and other agents). Its older **MCP server is in maintenance mode**; their docs say to prefer the plugin. | Yes. A mature design system tried MCP first and moved to a plugin with skills. We should not build an MCP server. |

What makes it production-ready is not the Storybook tooling, which is standard. Four things do: a written decision for every API, descriptions on every prop, interaction tests for behaviour, and a versioned package. ds-sync can generate the first two with AI and a review step, and already generates the tests and the package.

## 3. Gap analysis: Figma vs the real Blade vs ours

| Area | Figma (source) | Real Blade | Ours | Gap | Root cause | Class | Improvement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Prop naming | `Show Leading Icon`, `Is Intermediate`, `Screen Size` | `icon`, `isIndeterminate`, responsive props | `showLeadingIcon`, `isIntermediate`, `screenSize` | 34% name match | Names are taken from Figma literally; nothing translates Figma conventions to code conventions | Interpretation | AI proposes API names with evidence; decisions file; measured against Blade |
| Accordion leading | `Leading: None / Number / Icon` on the item | `showNumberPrefix` on the parent, `icon` on the header | `leading` enum on the parent | Same capability, different shape | Figma models a visual option, code models composition | Component modelling | Composition decisions (step 5) proposed by AI, applied by templates |
| Behaviour | Expanded and collapsed variants only | `expandedIndex`, `defaultExpandedIndex`, `onExpandChange` | `isExpanded` boolean, disclosure behaviour only on archetype templates | Controlled/uncontrolled and callbacks missing | Figma has no behaviour; we detect it by name only | Functional fidelity | Behaviour by structure (step 11); AI classifies the archetype, a template implements it |
| Slots | Boolean plus instance swap pairs (`Show Leading Icon` + `Leading Icon`) | One `icon` prop | Two props | Duplicate API | Instance swaps are not modelled as slots | Component modelling | Step 10 (slots), using the decisions file to merge pairs |
| States as props | `State: Default / Hover / Pressed` | CSS states | Pseudo states forced via `data-force-state` (correct), but Card's `state` axis kept as a prop | Some state axes not recognised | Detection by value names only | Interpretation | AI flags state axes; deterministic check confirms the values are visual only |
| Responsive | `Screen Size: Desktop / Mobile` | Responsive props, breakpoints tokens | `screenSize` prop | Viewport becomes a prop | No responsive model in the IR | Data model | IR gains `responsive` axis role; stories at Storybook viewports |
| Prop descriptions | Rare (component descriptions only) | JSDoc on every prop | `Figma: <name>` | Docs fidelity | No source text | Documentation | AI drafts descriptions from structure and Figma docs frames, marked "proposed" until accepted |
| Mis-modelled sets | `Collapsible` set appears to wrap a button | Disclosure component | Our `Collapsible` gets Button props (`variant`, `isLoading`, `leadingIcon`) | Wrong API | Exposed nested props flattened without judgement | Nested resolution | AI review of exposed props per set ("is this the component's own API?") |
| Visuals | Ground truth | Not compared (Blade code is not generated from this file) | 133 of 268 sampled variants match | 70 differ, Divider does not render | Layout and Divider bugs in the generator | Visual fidelity | Deterministic fixes; the AI diagnose skill sorts failures into generator vs design |
| Foundations pages | Variables, text styles | 7 token pages | Token CSS, no foundations pages | Docs IA | Not generated | Documentation | Generate Tokens pages from the IR (deterministic) |

Symptoms against root causes: almost every API gap has the same root cause. The generator turns Figma names and structures into code literally, and nothing in the pipeline makes the judgement a design-system engineer makes when writing `_decisions/decisions.md`. Fixing names one by one in templates would be the "isolated hardcoded fixes" the brief warns against. The fix is a judgement step with a contract.

## 4. Where the brief needs changing

Changes we recommend, where the request would make the product worse:

1. **"100% accurate, exactly like the real one".** This is only measurable against what the source specifies. A Storybook identical to Blade's needs Blade's code, which is the "document existing code" direction. We support both: Figma-only output with measured fidelity, and reference mode when code exists (`analyze` already reads a code repository's props).
2. **A new canonical Design System Model.** We already have one: the IR (`ir.json`, versioned, deterministic, Figma-independent after extraction) plus the component spec. Rewriting it would cost months and gain nothing. We extend it with a *decisions layer*, which is the one thing it lacks: interpretation, with its source and who approved it.
3. **16 skills, each with an agent.** That is too many: each split costs context and coordination, and most of those steps are deterministic code that already exists. We use **4 skills, 1 subagent and 1 hook** (section 6). Discovery, extraction, tokens, assets, generation and validation stay CLI commands.
4. **AI generating Storybook files.** No. AI output is data validated against a JSON Schema, and the generator turns it into code. Generated code then stays reproducible: the same IR plus the same decisions gives the same bytes, and every line traces to Figma or to a named decision.
5. **A single weighted fidelity score (25/30/25/10/10).** A weighted average hides failures: 95% overall can mean a broken component. We report each dimension separately, and gate each one: structure 100%, nested 100%, visual threshold, tests pass or accepted, docs complete. Any overall number is for dashboards, not for release decisions.
6. **Per-component skills** (the `*-story-skill.md` files in the working folder, one per component, written by hand for one design system). They do not carry over to another design system. Per-system knowledge belongs in data (`ds-sync.decisions.json`), and the skills stay generic.
7. **An MCP server or a hosted "AI bridge".** Not needed. Claude Code plugins load interactively, headless (`claude -p --plugin-dir`) and in `anthropics/claude-code-action@v1`. Blade's own team made the same move from MCP to a plugin.
8. **Renaming the CLI to `design2storybook`.** It brings no benefit and breaks the docs and the workflow. The command set already covers init, discover, extract, generate, visual, changes, analyze and report. We add `review`, `decisions validate`, `interpret` and `eval`.

## 5. Architecture

```
 Figma ──extract──▶ IR (ir.json) ──review──▶ .ds-sync/review/*.json ─┐  evidence: props, layers,
   │   (deterministic, cached)        (deterministic)                │  nested sets, docs frames,
   │                                                                  ▼  render, reference code
   │                                                      Claude (optional): plugin skills
   │                                                      interactive | claude -p | GitHub Action
   │                                                                  │ JSON Schema-checked
   │                                                                  ▼
   │                                       ds-sync.decisions.json  (proposed → accepted by a person, in git)
   │                                                                  │
   └──────────────────────────────── generate (IR + accepted decisions, deterministic) ──▶ Storybook
                                                                      │
                                         validate: structure, nested, visual, tests + axe, docs, eval
```

| Layer | Owns | Never does |
| --- | --- | --- |
| Engine (TypeScript CLI) | Figma API, caching, IR, tokens, assets, fonts, generation, Storybook config, tests, visual diff, reports, GitHub workflow | Guess meaning that is not in the data |
| AI (Claude Code plugin) | Interpretation the data leaves open: API names and shape, archetype and behaviour, slots, composition, state and responsive axes, prop and component descriptions, failure diagnosis | Write components or stories; change Figma, the IR or the config; accept its own proposals |
| Person | Accept or edit proposals (in a pull request or the review command), accept known design issues | Edit generated files |

**Decisions file** (`ds-sync.decisions.json`, schema `engine/schemas/decisions.schema.json`): one entry per component set, keyed by the Figma set name. Each entry has:
- a component description;
- per-property `name`, `description` and `role`;
- `evidence` (what in the source supports it);
- `confidence`, `by` (`ai` or the reviewer) and `status` (`proposed`, `accepted` or `rejected`).

The generator applies `accepted` entries. `--decisions proposed` previews proposals without accepting them, for evaluation. An unknown set or property name fails validation, so a decision can never silently stop applying after a Figma rename. It is reported instead.

**Integration options, compared.** The claims about Claude Code were checked against its current documentation (Claude Code 2.1.295 is installed here).

| Option | Accuracy | Reliability | Cost | Security | Offline | Install | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Claude Code plugin, interactive | High (a person in the loop) | High | Subscription | Runs as the user, only the tools its skills allow | Engine yes, AI no | `/plugin marketplace add` | **Yes**, the main way to use it |
| B. Headless `claude -p --plugin-dir … --output-format json --json-schema …` from `ds-sync interpret` | High (schema-checked) | High (exit codes, `structured_output`, `--max-budget-usd`) | API key or subscription | `--bare` and `--allowedTools` in CI | No | Needs `claude` on PATH | **Yes**, for batch work and CI |
| B2. Agent SDK or Messages API inside the CLI | Same | Same | API key only | We own the tool loop | No | npm dependency, our own agent code | Later, only if B is not enough |
| C. GitHub Action `anthropics/claude-code-action@v1` with `plugins` and `prompt` | High (PR review) | High | API key, OAuth token or Bedrock/Vertex | Secrets, OIDC | n/a | One workflow step | **Yes**, an optional step in the existing ds-sync workflow |
| MCP server | Same docs, more infrastructure | Server to run | Same | Extra surface | No | Separate install | No (see Blade) |

**Recommended: the hybrid of A, B and C on one plugin.** The same skills run in a session, from the CLI and in CI, so there is one set of instructions to maintain. The engine never needs an AI to run.

## 6. Skills, agent and hook

All of them are generic: they read the evidence files, and nothing in them names a design system.

| Unit | Purpose | Input | Output | AI? | Validation | Failure handling |
| --- | --- | --- | --- | --- | --- | --- |
| Skill `ds-sync` (orchestrator) | Set up, run the pipeline, ask the person, summarise reports. The existing figma-to-storybook skill, extended with `review`, `interpret` and `eval` | User request, config | Commands run, a summary | Coordinates; work is done by the CLI | CLI exit codes, reports | Stops and reports; never edits generated files |
| Skill `interpret-component` | Answer one component's review file: API names, roles, slots, archetype, descriptions | `.ds-sync/review/<Set>.json` | A decisions entry (JSON Schema) | Yes | Schema check; every name must exist in the evidence; confidence below 0.7 is flagged | Unknown → leaves the field out and writes a question; never invents |
| Agent `component-interpreter` | Runs `interpret-component` on a batch in its own context so many components run in parallel | List of review files | Decisions entries | Yes | Same | Per-component errors are reported; the batch continues |
| Skill `diagnose-fidelity` | Read test failures and the visual report; sort each into a design issue, a generator issue or a font/rendering issue; propose the fix location | Test output, `.ds-sync/visual/summary.json` | A diagnosis list in the report | Yes | Each claim cites a failing check | Unclear → "needs a person" |
| Skill `review-decisions` | Walk a person through proposed decisions, a few at a time; accept, edit or reject | Decisions file | Updated statuses | Assists | `ds-sync decisions validate` | Nothing is accepted without the person |
| Hook (PostToolUse on edits to `ds-sync.decisions.json`) | Run `ds-sync decisions validate` after every AI edit | The edited file | Pass, or the error shown to Claude | No | Schema + IR cross-check | Claude must fix it before going on |

Change detection, extraction, tokens, assets, generation, visual and accessibility validation are CLI commands, not skills. They already exist, and they must be deterministic.

## 7. Validation

| Measure | How | Gate |
| --- | --- | --- |
| Structure | Every public Figma set has a component; every variant property is in the API (or is a decision with a reason) | 100% |
| Nested consistency | Nested values per variant equal Figma's (exists) | 100% |
| Visual | Figma render vs story, pixelmatch, per variant (exists) | Match or "close" per variant, threshold set per system |
| Functional | Story tests with play functions for archetype behaviour; axe in every Figma mode (exists) | Pass, or a known design issue accepted by a person |
| Documentation | Every public component has a description; every prop has a description and a group | 100% for accepted components |
| AI accuracy (new, `ds-sync eval`) | When reference code exists: share of reference props whose name and kind the decisions predict, measured with the existing TypeScript prop analyser | Reported; used to improve the skills |

## 8. Roadmap

| Phase | Work | Acceptance | Size |
| --- | --- | --- | --- |
| 1 (this change) | `review` work list, decisions schema and validation, generator applies names and descriptions, plugin with skills, agent and hook, `interpret` runner (headless Claude), `eval` against reference code, Blade measured | Engine tests pass; Blade before and after measured; no change without decisions | M |
| 2 | Roles in decisions: `slot` (step 10), `state`, `responsive`, `drop`; composition for repeated children (step 5) | Blade Accordion, Card, Badge match Blade's API shape | L |
| 3 | Behaviour by structure (step 11): AI proposes the archetype, templates implement it; designed vs computed combinations (step 7) | Interactive components get behaviour tests | L |
| 4 | Audit and docs lint, scorecards per component in reports and PRs (step 12); generated Tokens and Guides pages | Each gate in section 7 reported per component | M |
| 5 | GitHub: optional `interpret` step in the ds-sync workflow, proposals opened as a PR for review | Workflow runs without an AI secret too | S |
| 6 | Release: npm publish (needs 2FA by the owner), plugin marketplace entry, a third design system tested end to end | `npx ds-sync` and `/plugin install ds-sync` work from scratch | M |

## 9. Status of phase 1 (13 Nov 2026)

| Piece | State |
| --- | --- |
| `ds-sync review` | Done. Blade: 108 evidence files (49 public components), each with properties, the name the generator uses today, the default variant's layers and their bindings, docs text, and hints (slot pairs, viewport axes, True/False axes, missing descriptions) |
| `ds-sync.decisions.json`, schemas, `ds-sync decisions validate / accept / reject` | Done. Unknown sets or properties, invalid or clashing names and stale entries are reported; invalid entries are never applied |
| Generator applies decisions | Done for names and descriptions (React and Web Components; component, stories, docs page, report). Data attributes keep the Figma names, so CSS does not change. Without a decisions file the output is byte-identical (checked on Design System AI) |
| Claude Code plugin | Done: 4 skills, 1 agent, 1 hook; `claude plugin validate` passes for the plugin and the marketplace |
| `ds-sync interpret` | Done, and run on Blade (results below) |
| `ds-sync eval` | Done |
| Engine tests | 91 passing (8 new) |

### First real run on Blade (28 benchmark components, Figma evidence only)

| Measure | Result |
| --- | --- |
| Calls | 28 answered, 0 failed, about $6.05 in total (about $0.22 per component), 4 at a time |
| Proposals | 28 sets, all valid against the schema and the Figma data; 14 renames applied, 143 property descriptions (there were none before), 110 questions for a designer, 20 properties under 0.7 confidence |
| Name match with Blade's code | **70 → 71 of 207 (34% → 34%)**. Gained: Checkbox `isIndeterminate`, Modal `size`, ButtonGroup `isFullWidth`. Lost: Tabs `isFullWidth` (Blade keeps `isFullWidthTabItem`), Toast `showLeadingIcon` (Blade: `leading`) |
| Build with proposals applied | React and Web Components type-check; story tests unchanged at 259 of 405, the same colour-contrast failures as without decisions |
| Recall of Blade's names | Most renames are *not* Blade's names (`lineStyle` vs `dividerStyle`, `buttonCount`, `itemCount`). The model followed the evidence, not a memory of Blade's code; the contamination risk looks small for this file |

What this shows:

1. **Renaming is not where the gap is.** The 136 Blade props still unmatched mostly have no Figma property at all: `isOpen`, `value`, `name`, `snapPoints`, `initialFocusRef`, `data`, sticky table options. A better name cannot create them. The gap is structure and behaviour: slots, controlled state, composition. That confirms the order of phases 2 and 3.
2. **The real gain is documentation and questions.** 143 descriptions now come with their evidence, where the props table only said "Figma: …". The 110 questions give a designer a review list; for example, Checkbox's `errorText=True` has no layer bound to it.
3. **Name match is a weak score on its own.** A defensible rename can lower it (Tabs), and the reference is one team's choices, not ground truth. Future scoring should count *capabilities* (which Blade props have any generated counterpart, by role) as well as names.
4. **Fixed during the run:** proposals renamed instance-swap properties, which are not props yet. Those names are now dropped (6 removed), and only their descriptions are kept.

## 10. Phases 2 and 3, first increment (13 Nov 2026)

What changed, all deterministic and generic (no design-system names in the rules):

| Piece | What it does | Where it applied on Blade |
| --- | --- | --- |
| Slots (step 10) | An instance swap bound to a layer becomes a content prop: React `ReactNode`, Web Components a named `<slot>`; the Figma instance stays as the default. The visibility boolean keeps working. | Badge, Tag, Chip, Toast, Alert and others (`leadingIcon`, `icon`) |
| Placeholders as children (step 5, part) | An instance of a component named "Slot" (a common Figma convention) becomes `children`; several become named content props | Accordion item body, Drawer, Card, Popover, Bottom Sheet, Table, Toast (Modal uses the dialog template, which has its own `children`) |
| Checkbox by structure (step 11, part) | A set with a checked True/False axis gets the WAI-ARIA checkbox pattern: native button, `role="checkbox"`, `aria-checked` with "mixed" from an indeterminate axis, Space toggles (Enter does not), controlled or uncontrolled. A visible label is the accessible name | Checkbox |
| Disclosure by structure (step 11, part) | An expanded True/False axis, plus one layer Figma shows only when expanded (the panel) and one frame shown always (the header), gives the WAI-ARIA disclosure pattern: the header is a native button with `aria-expanded` and `aria-controls`; `isExpanded` controls it, `defaultExpanded` and `onExpandedChange` make it uncontrolled. Nested disclosures keep their own state | Accordion item (Blade's accordion was visuals-only before) |
| Designed vs computed (step 7) | The docs page says how many combinations Figma designs, and that the rest are computed | Every set with undesigned combinations |

Checks:

| Check | Result |
| --- | --- |
| Engine tests | 97 passing (6 new) |
| Design System AI | 306 of 306 story tests in React and Web Components; 2 components gained slots (ListItem controls, AvatarGlyph icon); no other output change apart from the docs note |
| Blade story tests | 261 of 407 (was 259 of 405): the two new expand/collapse tests pass, and the per-component failure list is identical to before (colour contrast only). Both outputs type-check, both Storybooks build |
| Blade visual check | Checkbox and Badge unchanged against Figma (24 and 35 matching variants). Accordion item, newly measured: 4 of 6 match |
| API match with Blade's code (generated props, same rule) | 74 → 75 of 207; 76 with the AI proposals. Slots exist now, but Blade names them `icon` where Figma says `leadingIcon`: naming them is what the review files now allow the AI to propose |

Not done in that increment, and done since (14 Nov 2026):

- **Responsive viewport axes.** `generate.breakpoints` in the config maps viewport values to media conditions (`{ "Mobile": "(max-width: 767px)" }`). An axis named Screen Size, Device, Breakpoint, Viewport or Platform with a configured value then follows the viewport when its prop is not set, through copies of its CSS rules inside the media queries; setting the prop pins one layout. Without the setting nothing changes, because Figma does not say at which width a layout switches. Blade (local test with that one breakpoint): Modal, Drawer, Card, Carousel, Table and Media Card follow the viewport.
- **Button and link.** A set named as a button or a link (not a building block) renders the Figma layers inside a native `<button type="button">` or `<a>`, with native `disabled`, `aria-busy` from a loading axis, phrasing content only, a focus ring when Figma has none, and a story test. Nothing structural marks a button in Figma, so the name is the evidence, and an `archetype` decision corrects it either way. Components without text, and icon-only variants, have no accessible name: stories give a default, nested ones are named from their layer name, and the report says to confirm both. Blade: Button, IconButton, Link.
- **Archetype decisions.** `archetype` in `ds-sync.decisions.json` (`button`, `link`, `checkbox`, `switch`, `disclosure`, `generic`) picks the behaviour template for a single-set component; the interpret skill may propose one when the evidence shows it.

Checks after these: engine 100 tests; Design System AI unchanged, 306 of 306 in both outputs; Blade React 264 of 410 and Web Components 263 of 409, failures colour contrast only (two React timeouts in one full run passed on rerun).

- **Repeated children with parent context (step 5).** When a component places several copies of one child (Accordion items, Breadcrumb links, Chip Group chips, Tabs, Checkbox and Radio groups, list options), consumers can pass their own children instead of Figma's examples. The parent sets what it drives on each child the consumer did not set: values that are the same on every copy and come from the parent's own props (Accordion: `leading`, `showLeading`; Chip Group: `size`), and text numbered by position ("1.", "2.", "3." becomes `${i + 1}.`). The same example text on every copy is content, so it is not pushed onto your children. Each child is wrapped like the Figma copies, so layout stays the same. Web Components use a slot, and the parent sets the same properties on the slotted elements. Copies with their own visibility toggles (table columns) stay as designed. Blade: 9 components; Design System AI: Dropdown Menu.
- **Test reliability.** Generated projects give story tests 30 seconds: in a large library the first story of a file includes browser start-up, which passed 15 seconds in some full runs.

Checks after these: engine 102 tests; Design System AI 306 of 306 in both outputs (Dropdown Menu gains `children`); Blade React 264 of 410 and Web Components 263 of 409, failures colour contrast only, no timeouts.

Still open: a single radio without a group (it needs group semantics to be useful).

## 11. Phase 4, first increment: scorecards and audit (14 Nov 2026)

- **Scorecards** (`engine/src/generate/scorecard.ts`). For every component there is one status per measure from [QUALITY.md](fidelity/QUALITY.md): visual fidelity, variants, properties, nested consistency, interaction, tokens, accessibility, documentation and open decisions. Each comes with one line of evidence. There is no weighted total, as section 4 argues. They appear on docs pages (Design reference), in `GENERATION-REPORT.md`, and in `scorecard.json`.
- **`ds-sync audit`** reads the scorecards. With `--tests <vitest json>` it replaces the interaction and accessibility lines with real test results, separating contrast failures from behaviour failures. It uses a visual check of the same Figma version when one exists. It writes `audit.md` and `audit-summary.md`, and `--strict` fails on any ✗.
- **The GitHub workflow** saves a JSON test report, runs the audit, adds the summary to the pull request and keeps `audit.md` with the run's files.

First audits:

| Measure | Design System AI (27 public): ✓ / ⚠ / ✗ / – | Blade (49 public) |
| --- | --- | --- |
| Visual fidelity | not measured for this Figma version | 3 / 4 / 4 / 38 (Divider: 0 of 48, a known rendering bug) |
| Properties | 25 / 2 / 0 / 0 | 48 / 1 / 0 / 0 |
| Nested consistency | 4 / 0 / 0 / 23 | 29 / 0 / 0 / 20 |
| Interaction | 9 / 7 / 0 / 11 | 10 / 12 / 0 / 27 |
| Accessibility | 9 / 18 / 0 / 0 (accepted known issues) | 29 / 3 / 17 / 0 (contrast in Blade's palette) |
| Documentation | 1 / 26 / 0 / 0 | 0 / 1 / 48 / 0 (no descriptions in Figma; AI proposals not accepted) |

The audit points to the next work by itself:
- Blade's documentation needs its descriptions accepted.
- 12 Blade components (Tabs, Chip, Dropdown, Pagination and others) look interactive but have no behaviour template.
- Divider doesn't render.

Still open from step 12: a separate docs lint.

## 12. Reproduce

- Blade Storybook inventory: `fetch('https://blade.razorpay.com/index.json')`.
- Blade source: `git clone --depth 1 --filter=blob:none --sparse https://github.com/razorpay/blade`, with sparse paths `packages/blade/src/components` and `packages/blade-plugin`.
- Prop comparison: `ds-sync eval --reference <blade>/packages/blade/src/components --decisions none|proposed` (section 7).
- AI run: `ds-sync review`, then `ds-sync interpret --budget 0.5`, then `ds-sync eval … --decisions proposed`.
