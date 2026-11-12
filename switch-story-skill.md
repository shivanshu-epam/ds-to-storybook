---
name: switch-story
description: >
  Build or refresh Switch's Storybook stories and docs page from the
  "↳ Switch" Figma page, covering only what that page has. Trigger on
  "switch stories", "build storybook for switch". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Switch/Switch.tsx
---

# Switch: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ Switch`, `723:3` |
| ComponentSet | `Switch`, `723:3038` |
| Example frame | `Examples: Settings list`, `723:3045` (labels: Notifications, Dark mode, Auto-save, Beta features) |
| Doc frames | a single `Documentation` frame, `995:37` |
| Output | `src/components/Switch/Switch.stories.tsx` + `Switch.mdx`, title `Components/Switch` |

## 2. Figma snapshot (2026-11-10)

**12 variants** = Value (Off · On) × Interaction (Default · Disabled · Loading) × Size (Medium · Small). There's one boolean property, `Show Inner Content` (default true). The default variant is Off / Default / Medium.

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Value | `checked` / `defaultChecked` |
| Interaction = Disabled | `disabled` |
| Interaction = Loading | `loading` |
| Size: Medium / Small | `size="md" \| "sm"` |
| Show Inner Content | `showInnerContent` |
| Example labels | `label` |

**Out of scope, hidden:** `helperText`, `labelPosition`.

## 4. Stories

`Default` (play: a click toggles `aria-checked`) · `Values & interactions` (grid) · `Sizes` · `Inner content` · `Keyboard` (Tab then Space) · `Loading` (play: clicks are ignored) · `Settings list`.

## 5. Known issues

None. Figma's Flags section says the inner icon is resolved.
