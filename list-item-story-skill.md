---
name: list-item-story
description: >
  Build or refresh List Item's Storybook stories and docs page from the
  "↳ list-item" Figma page, covering only what that page has. Trigger on
  "list-item stories", "build storybook for list item". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/ListItem/ListItem.tsx
---

# List Item: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ list-item`, `122:4` |
| ComponentSet | `ListItem` `520:3110` |
| Example | `Examples / Leading & Trailing Control` `528:2668`: invoices with a leading checkbox, cards with a leading radio, settings with a trailing checkbox, notifications with a trailing radio |
| Doc frames | `Documentation / Usage` `1322:771` · `Style` `1322:1217` · `Accessibility` `1322:1971` |
| Output | `src/components/ListItem/ListItem.stories.tsx` + `ListItem.mdx`, title `Components/List Item` |

## 2. Figma snapshot (2026-11-10)

**108 variants:**
- Type: Default · Menu · File · Setting
- State: Default · Hover · Pressed · Focused · Disabled · Selected · Activated · Dragged · Skeleton
- Size: Sm · Md · Lg
- Booleans and swaps: `has-leading-control` and `has-trailing-control`, each with an instance swap (default `CheckboxControl`)

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Type | `type` |
| Size | `size` |
| Headline | `headline` |
| Supporting text | `supportingText` |
| Metadata | `metadata` |
| Leading icon | `leadingIcon` |
| Control | `control` + `controlPosition` |
| Selected | `selected` |
| Activated | `activated` |
| Disabled | `disabled` |
| Dragged | `dragging` |
| Skeleton | `loading` |

Rows are wrapped in `List`, because items need a list for semantics. Stories that render their own lists set `parameters.ownList`.

**Out of scope, hidden:**
- nesting (`level`, `nested`, `expanded`): the doc says it isn't built;
- `truncate`: not exposed;
- `draggable` handle, `leading`, `trailing`, `href`.

## 4. Stories

`Default` · `Types` · `Sizes` · `States` · `Leading & trailing controls` · `Keyboard` · `Do & don't`.

## 5. Known issues

- **Figma doc:** says the List container isn't built yet (Placement), but the code has `List`.
- **Figma doc:** typography isn't token-bound.
