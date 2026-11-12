---
name: dropdown-story
description: >
  Build or refresh Dropdown's Storybook stories and docs page from the
  "↳ Dropdown" Figma page, covering only what that page has. Trigger on
  "dropdown stories", "build storybook for dropdown". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Select/Select.tsx
---

# Dropdown: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ Dropdown`, `396:3` |
| ComponentSets | `DropdownTrigger` `396:1799` · `DropdownMenu` `400:1970` · `Dropdown` `401:2471` |
| Examples | `402:2281`: Searchable, Grouped, Multi-select, Clearable, Disabled, Error |
| Doc frames | `Documentation / Usage` `1345:600` · `Style` `1345:1013` · `Accessibility` `1345:1570` |
| Output | `src/components/Select/Select.stories.tsx` + `Select.mdx`, title **`Components/Dropdown`** (the code name is `Select`) |

## 2. Figma snapshot (2026-11-10)

**DropdownTrigger (21 variants):**
- Size: Small · Medium · Large
- State: Default · Hover · Focused · Disabled · Error · Read-only
- Expanded variant per size
- `Clearable` boolean

**DropdownMenu (3 variants):** State Default · Loading · Empty, with booleans `Show Search` and `Grouped`.

**Dropdown (6 variants):** Size × Collapsed / Expanded.

**Sample options:** Bubble tea, Iced coffee, Green tea, Hot chocolate (sold out). Placeholder: "Select an option".

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Size | `size` |
| Clearable | `clearable` |
| Show Search | `searchable` |
| Grouped | `options[].group` |
| Loading | `loading` |
| Empty | `emptyText="No results found"` |
| Error | `error` |
| Disabled | `disabled` |
| Read-only | `readOnly` |

**Out of scope, hidden:** `hideLabel` (Figma: the placeholder must not replace a label), `helperText`, `required`.

## 4. Stories

`Default` (play: select an option) · `Sizes` · `Trigger states` · `Searchable` (play: filter) · `Grouped` · `Clearable` · `Menu states` · `Keyboard`.

## 5. Known issues

- **Fixed 2026-11-10:** the Loading and Empty menus used to put `role="status"` inside `role="listbox"`, which failed axe `aria-required-children`. `Select.tsx` now renders the status message beside the listbox, and the listbox gets `aria-busy` while loading. The `Menu states` story guards against a regression.
- **Code gap:** the trigger is sized to its content. Figma's trigger is a fixed 320px at every size.
- **Code gap:** there's no multi-select (Figma example "2 selected").
- **Code gap:** the loading text is "Loading…"; Figma says "Loading options…".
- **Code gap:** the Error state isn't storied. Figma's Error trigger has a red border and no message, but `Select` only shows error styling with a message.
- Triggers use `hideLabel` with the placeholder as the accessible name, because Figma's triggers have no visible label. The Figma doc says to pair the dropdown with a label, which contradicts its own visuals.
