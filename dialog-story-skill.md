---
name: dialog-story
description: >
  Build or refresh Dialog's Storybook stories and docs page from the
  "↳ dialog" Figma page, covering only what that page has. Trigger on
  "dialog stories", "build storybook for dialog". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Modal/Modal.tsx, src/components/Drawer/Drawer.tsx
---

# Dialog: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ dialog`, `339:3` |
| ComponentSet | `Dialog` `348:627` |
| Examples | `352:1583`: Storage limit reached, Edit profile, Create new project, Notification settings, Delete this file? |
| Doc frames | `Documentation / Usage` `1341:976` · `Style` `1341:1657` · `Accessibility` `1341:1947` |
| Output | `src/components/Modal/Modal.stories.tsx` + `Modal.mdx`, title **`Components/Dialog`** (the code name is `Modal`) |

## 2. Figma snapshot (2026-11-10)

**30 variants:**
- Type: Confirmation · Alert · Form · Full-screen · Side-drawer
- Size: Small · Medium · Large · Full
- State: Open · Loading · Error
- Booleans: `Has close button`, `Has secondary action`, `Has subtitle`, `Scrollable content`
- Text: Title, Subtitle, Body

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Confirmation | `variant="transactional"` |
| Alert | `variant="acknowledgment"` |
| Form | transactional + form children |
| Full-screen | `size="full"` |
| Side-drawer | **`Drawer`** (Modal has no side placement) |
| Footer patterns (doc) | `variant`: passive, danger, progress |
| Size Small / Medium / Large | `size="sm" \| "md" \| "lg"` (400 / 480 / 640) |
| Loading | `loading` |
| Error | `error` |
| Has subtitle | `label` |
| Has secondary action | `secondaryLabel` |

**Out of scope, hidden:**
- `overlay`: Figma says the overlay isn't built as a component;
- `dismissible`, `hideCloseButton`;
- `size="xs"`.

## 4. Stories

`Confirmation` · `Alert` · `Form` · `Form · Error` · `Loading` · `Danger` · `Passive` · `Progress` · `Sizes` · `Full-screen` · `Side-drawer` · `Scrollable content` · `Keyboard` (Esc closes, focus returns to the trigger).

Each dialog story renders in its own iframe on the docs page (`inline: false`). The dialog is a native `<dialog>` opened with `showModal()`, so tests assert the `open` attribute: there's no `aria-modal` attribute, and the opening animation makes `toBeVisible` flaky.

## 5. Known issues

- **Code gap:** `label` renders the subtitle **above** the title; Figma puts it below.
- **Code gap:** Loading shows a spinner in the primary button, not Figma's "Loading…" label.
- **Do/Don't:** these are text-only in the docs, since overlapping modal renders can't sit side by side.
