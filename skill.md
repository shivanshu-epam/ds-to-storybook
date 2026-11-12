---
name: storybook-agent
description: >
  Builds or refreshes the Storybook stories and docs page for a design-system
  component strictly from that component's Figma page — its ComponentSet
  (variant axes + component properties) and its "Documentation / …" frames.
  Storybook covers only what Figma has: anything the React component can do
  that Figma doesn't show or document is left out and reported, never
  storied. Trigger when the user asks to build, generate, refresh or sync
  Storybook / stories / docs for a component ("build storybook for button",
  "sync the alert stories with Figma"), or when orchestrator.md routes to the
  Storybook Creation phase. Each component has its own skill in this folder
  (<component>-story-skill.md) that pins its Figma page, property-to-prop
  mapping and story list; this file is the shared contract they all follow.
version: 1.0.0
last_updated: 2026-11-05
references:
  - rules/wcag-rules.md (blocking gate — the a11y addon runs with test: 'error')
  - rules/global-rules.md §3 (HITL Protocol)
  - agents/05-documentation-agent/component-documentation-skill.md (produces the Figma doc frames this agent reads)
  - .storybook/main.ts, .storybook/preview.tsx (theme/project globals, a11y config)
---

# 08 Storybook Agent

Turns a component's **Figma page** into its **Storybook stories + docs page**. Figma is the source of truth for *what* gets shown; the React component in `src/components/` is the source of truth for *how* it renders.

## 1. Core principle: Figma-scoped coverage

Storybook shows exactly what the Figma page shows, no more and no less.

| Figma has it | Code has it | Result |
|---|---|---|
| ✅ | ✅ | Story it. |
| ✅ | ❌ | Don't fake it with inline styles or a wrapper. Report it as a **code gap**. |
| ❌ | ✅ | Leave it out of stories, controls and docs. Report it as **out of Figma scope**. Hide its prop from the Controls panel (`argTypes: { prop: { table: { disable: true } } }`). |
| Documented in a Figma doc frame but not a component property (e.g. "Spacing comes from the density collection") | ✅ | Counts as Figma coverage. Story it and cite the doc frame. |
| Figma doc says "defined in the skill but not built / not exposed yet" | either | Out of scope. That sentence is Figma saying "not yet". |

"Figma has it" means one of these:
- a variant option on the ComponentSet,
- a component property (BOOLEAN / TEXT / INSTANCE_SWAP),
- a behaviour or element described as **built** in one of the page's `Documentation…` frames.

Never use the 03-component-agent build skill, a reference system, or the existing `.stories.tsx` as a source of scope. Those describe what the component *could* be.

## 2. Inputs

| Input | Where |
|---|---|
| Figma file | `I983NcgqSiY14YkpJbwjG8` (Design-system-AI). Override only if the user gives another link. |
| Component page | `↳ <component>` page, pinned in the component's story skill (page id + ComponentSet id). |
| React component | `src/components/<Name>/<Name>.tsx`. |
| Existing stories | `src/components/<Name>/<Name>.stories.tsx`. Replaced, not merged. Read it first so the report can list what was dropped. |
| Component story skill | `agents/08-storybook-agent/<component>-story-skill.md`. |

## 3. Workflow

### Step 1: Read Figma (always live, never from memory)

Use the Figma MCP server: `create_session`, then read-only `use_figma` calls (load the `figma-use` skill first), one call per page.

1. Switch to the component's page by id. If the id no longer resolves, find the page by name (`↳ <component>`, case-insensitive). If neither works, stop and report.
2. From the ComponentSet, record its `componentPropertyDefinitions`: variant axes with their options, plus each boolean, text and instance-swap property with its default. Also record the variant count and the `description`.
3. From every top-level frame whose name contains `Documentation`, extract all text in reading order. Keep the tab and section headings (Usage / Style / Accessibility; Overview, Anatomy, Sizes, States, Content, Keyboard, Do/Don't, Flags…).
4. Take one `get_screenshot` of the ComponentSet to use as a visual reference when checking the stories.

### Step 2: Diff against the snapshot in the component's story skill

Each story skill has a **Figma snapshot** table: what the page held when that skill was written. Compare the live read against it.
- **No drift:** continue.
- **Drift** (an axis option added or removed, a property renamed, a doc section added or removed): show the diff to the user. Rebuild the coverage manifest from the **live** read, never from the snapshot. Offer to update the snapshot table in the story skill afterwards.

### Step 3: Build the coverage manifest

Write a table with one row per Figma axis option, property, documented behaviour and keyboard interaction. Columns:

`Figma item` · `Source (set property / doc frame + section)` · `React prop / value` · `Status: story | code-gap | n/a`

Then add a second table that lists every React prop **not** in the manifest. These are the out-of-scope props that get hidden from Controls.

### Step 4: HITL checkpoint (required)

Show the user, per `rules/global-rules.md §3`:
- the manifest,
- the planned story list (name and what it shows),
- the stories that will be **removed** from the current `.stories.tsx` because Figma doesn't cover them,
- code gaps.

Wait for an explicit go-ahead before writing any files.

### Step 5: Write the files

For each component, write two files next to the component:

1. **`<Name>.stories.tsx`.** Follow the conventions in §4. Replace the whole file.
2. **`<Name>.mdx`.** The docs page. Its sections mirror the Figma doc tabs (§5). The stories file drops the `autodocs` tag so there aren't two docs pages.

One-time setup: if `.storybook/main.ts` `stories` doesn't include `'../src/**/*.mdx'`, add it, and tell the user you did.

Never edit the component's `.tsx` or `.module.css`, tokens, or `tokens.css`. A code gap is reported, not fixed here.

### Step 6: Verify

1. Run `npm run typecheck`.
2. Run `npx vitest --project storybook run src/components/<Name>`. This runs every story in both themes, including play functions and the a11y addon.
3. Start Storybook with `preview_start` using the `storybook` entry in `.claude/launch.json` (create the entry if it's missing: `npm run storybook`, port 6006). Open the docs page and the matrix story, and compare them with the Figma ComponentSet screenshot.

An a11y failure blocks shipping (`rules/wcag-rules.md`). If the failure comes from token contrast that the Figma Accessibility tab already reports, don't work around it, and don't disable the rule globally. Report it under **Blocking**, and only add a per-story `parameters.a11y.test: 'todo'` with a comment citing the Figma contrast row if the user approves.

### Step 7: Report

Send a chat report with these parts, and nothing written into Figma:
- **Built:** the stories and docs sections created.
- **Removed:** the stories that were dropped from the previous file, each with the reason it's out of Figma scope.
- **Out of Figma scope:** the React props hidden from Controls.
- **Code gaps:** what Figma has that the code can't render.
- **Figma doc issues:** stale or contradictory doc text. For example, a doc saying "no Storybook linked yet" is now out of date; offer a 05-documentation-agent follow-up.
- **Blocking:** a11y or test failures, with output.

## 4. Story conventions

- **Title:** `Components/<Figma component name>`, using the Figma set's name and not the code filename. For example, Figma's "Input" gives `Components/Input` even though the code is `TextInput`.
- **Meta:** set `args` defaults to the Figma property defaults, translated to props. Declare `argTypes` only for Figma-scoped props. Each argType's `description` names its Figma property, e.g. `'Figma: Variant'`.
- **One story per variant-axis option is unnecessary.** Use:
  - `Default`: the Figma default variant, with every property at its Figma default.
  - One **matrix story** per pair of Figma axes that a Style "Variants & states" grid documents, laid out the same way as that grid.
  - One story per remaining axis (Sizes, Radius…), shown side by side.
  - One story per boolean or instance-swap property that changes the anatomy (icons, close button, character count…).
  - One story per documented **behaviour** that has a play function (click, dismiss, clear, keyboard).
- **States:**
  - Disabled and Error are props, so story them directly.
  - For **Focus**, use a play function: `await userEvent.tab()` and assert `toHaveFocus()`.
  - Hover and Pressed are pseudo-states. Don't fake them with class names. If the user approves adding `storybook-addon-pseudo-states`, the matrix story can show them; otherwise mention them in the docs page and leave them out of the matrix.
- **Play functions:** turn every row of the Figma **Keyboard interactions** table and every **Interactions** bullet into an assertion where it's testable in the browser.
- **Content:** use only text that appears in Figma: variant text, component-property defaults, example frames and doc frames (e.g. "Update available / Version 4.2 is ready to install.").
  - Never invent sample labels, messages, names, icons or images.
  - If Figma shows a state with no text (e.g. an error with no message) and the code can't render it without text, don't fill it in. Leave the state out and report it as a code gap.
  - Read the variant's own text nodes first: Figma often has the exact string (e.g. "Warning message goes here").
- **No added prose:** story descriptions and docs pages contain only Figma's documentation text. Don't add how-to hints ("click the canvas", "use the Size control"), notes about omitted pointer states, or tooling notes.
- **Required accessible names:** an accessible name the code requires but Figma doesn't show (e.g. a Switch in a grid) goes in `aria-label`, never as visible text.
- **Layout wrappers:** use inline `style` with token CSS variables only (`var(--space-…)`), never raw px except the container widths Figma states (e.g. Alert width 400).
- **Fixed widths and wide grids:**
  - If the meta decorator fixes Figma's width, let multi-column stories opt out with `parameters.fixedWidth = false`.
  - Wrap any grid wider than the docs canvas in `<div role="region" aria-label="…" tabIndex={0} style={{ overflowX: 'auto' }}>`. The a11y gate fails a scrollable region that isn't focusable.
- **Sample copy:** keep sample text (title, description) separate from other sample fields (e.g. an action label). Spreading the whole sample object into props passed a string into Alert's `action` prop and rendered an empty, unlabelled button.
- **Story descriptions:** set `parameters.docs.description.story` to the matching Figma doc sentence, cited by tab and section.

## 5. Docs page (`<Name>.mdx`)

```mdx
import { Meta, Title, Subtitle, Canvas, Controls, Story } from '@storybook/addon-docs/blocks';
import * as Stories from './<Name>.stories';

<Meta of={Stories} />
<Title />
<Subtitle>{/* Figma one-line description from the doc header */}</Subtitle>
<Canvas of={Stories.Default} />
<Controls of={Stories.Default} />

## Usage            ← Figma "Documentation / Usage": Overview, When to use / not, Anatomy, Sizes, Placement, Content, Behaviors
## Style            ← Figma "Documentation / Style": Color token table, Typography, Structure, Variants & states (embed matrix story), Icons
## Accessibility    ← Figma "Documentation / Accessibility": What the DS provides, Development considerations, Keyboard table
```

- Copy Figma's text faithfully: shorten it, never add to it. Tables stay tables.
- Storybook's MDX doesn't render GitHub-style `|` tables (there's no `remark-gfm`). Define a small `export const Table = ({ head, rows }) => …` helper at the top of the `.mdx` and render tables through it. Don't add a dependency for this. See `src/components/Button/Button.mdx`.
- Play functions don't run in docs-page embeds, so a docs `<Canvas>` of a play-driven story (Focused, keyboard) shows only its starting state. Say how to trigger it in the text next to the canvas.
- Do/Don't pairs become a two-column `<Canvas>` of real component renders with the Figma caption under each.
- Leave out "Live demo", "Accessibility testing status" and "Flags" sections. Those are notes about Figma's own state. Report Flags in chat instead.
- Leave out the contrast-ratio table. Link to the a11y addon panel instead ("Live contrast checks run in the Accessibility panel for every story"), and list Figma's failing rows under **Blocking** in the chat report.
- If a component has a single `Documentation` frame instead of the three tabs (e.g. Input), map its sections to the nearest tab and keep its order.

## 6. Done when

- Every row in the manifest is either storied, or listed as a code gap or as out of scope.
- No story, control or docs section shows anything outside the manifest.
- Typecheck passes and the story tests pass, or each failure is listed under Blocking with output.
- The report has been sent, and the user has been offered the snapshot update if Figma had drifted.

## 7. Component story skills

| Component | Skill | Figma page |
|---|---|---|
| Button | [button-story-skill.md](button-story-skill.md) | `↳ button` (99:2) |
| Alert | [alert-story-skill.md](alert-story-skill.md) | `↳ alert` (293:5) |
| Input | [input-story-skill.md](input-story-skill.md) | `↳ Input` (827:3) |
| Accordion | [accordion-story-skill.md](accordion-story-skill.md) | `↳ accordion` (236:1534) |
| Avatar | [avatar-story-skill.md](avatar-story-skill.md) | `↳ avatar` (273:894) |
| Badge | [badge-story-skill.md](badge-story-skill.md) | `↳ badge` (211:3) |
| Breadcrumb | [breadcrumb-story-skill.md](breadcrumb-story-skill.md) | `↳ breadcrumb` (224:3) |
| Carousel | [carousel-story-skill.md](carousel-story-skill.md) | `↳ carousel` (241:3) |
| Checkbox | [checkbox-story-skill.md](checkbox-story-skill.md) | `↳ checkbox` (178:3) |
| Date Picker | [date-picker-story-skill.md](date-picker-story-skill.md) | `↳ Date Picker` (620:46) |
| Dialog (code: Modal) | [dialog-story-skill.md](dialog-story-skill.md) | `↳ dialog` (339:3) |
| Divider | [divider-story-skill.md](divider-story-skill.md) | `↳ divider` (509:3) |
| Dropdown (code: Select) | [dropdown-story-skill.md](dropdown-story-skill.md) | `↳ Dropdown` (396:3) |
| Form | [form-story-skill.md](form-story-skill.md) | `↳ Form` (427:3) |
| Icon | [icon-story-skill.md](icon-story-skill.md) | `↳ Icons` (109:17) |
| List Item | [list-item-story-skill.md](list-item-story-skill.md) | `↳ list-item` (122:4) |
| Radio | [radio-story-skill.md](radio-story-skill.md) | `↳ Radio` (371:3) |
| Switch | [switch-story-skill.md](switch-story-skill.md) | `↳ Switch` (723:3) |

To add a component, copy one of these skills, re-pin the page and set ids, and rebuild the snapshot, mapping and story list from a live Figma read.

## 8. Storybook-wide scope

Storybook holds only Figma content:
- **Foundations** is generated from the Figma variables export (`tokens/figma-variables.json`). To check it, compare per-collection hashes against a live read, re-export only the differing rows, and run `npm run tokens`.
- **Components** has one entry per Figma component page above.

Code components without a Figma page have their stories deleted. The code itself stays, because other components depend on it (IconButton, Drawer, Loading, Tooltip…).

Not storied:
- the Foundations page's `Slot/*` parts, which are internal pieces of List Item;
- the `Multi-Project QA` page.

When a new Figma component page appears, add a story skill for it here. When a page is removed, delete its stories.

Shared story helpers (caption, `Labelled`, `Matrix`, `Guideline`, `DocTable`, `hidden`) live in `src/storybook/helpers.tsx`.
