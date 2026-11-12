---
name: checkbox-story
description: >
  Build or refresh Checkbox's Storybook stories and docs page from the
  "↳ checkbox" Figma page, covering only what that page has. Trigger on
  "checkbox stories", "build storybook for checkbox". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Checkbox/Checkbox.tsx
---

# Checkbox: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ checkbox`, `178:3` |
| ComponentSets | `CheckboxControl` `178:1224` · `CheckboxField` `190:1205` · `CheckboxGroup` `192:1420` |
| Doc frames | `Documentation / Usage` `1328:1001` · `Style` `1328:1387` · `Accessibility` `1328:2585` |
| Output | `src/components/Checkbox/Checkbox.stories.tsx` + `Checkbox.mdx`, title `Components/Checkbox` |

## 2. Figma snapshot (2026-11-10)

**CheckboxControl (90 variants):**
- Size: Sm · Md · Lg
- Type: Unselected · Selected · Indeterminate · Error-Unselected · Error-Selected · Error-Indeterminate
- State: Enabled · Hovered · Focused · Disabled · Pressed

**CheckboxField (18 variants):**
- Type: Unselected · Selected · Indeterminate
- State: Enabled · Focus · Invalid · Warning · Read-Only · Disabled
- Booleans: `Has label`, `Has description`, `Has helper`
- Text: `Label`, `Value`

**CheckboxGroup (8 variants):**
- State: Enabled · Invalid · Warning · Read-Only
- Orientation: Vertical · Horizontal

The Usage doc also lists a **Skeleton** field state.

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Value | `label` |
| Has description | `description` |
| Has helper | `helperText` |
| Size | `size` |
| Type=Indeterminate | `indeterminate` |
| Type=Error-* | `aria-invalid` (control grid) or `error` (field) |
| Invalid | `error` |
| Warning | `warning` |
| Read-Only | `readOnly` |
| Disabled | `disabled` |
| Skeleton | `loading` |
| CheckboxGroup | `CheckboxGroup` (`legend`, `orientation`, `error`, `warning`) |

## 4. Stories

`Default` · `Selection types` (play: `toBePartiallyChecked`) · `Control types & states` (grid) · `Sizes` · `Field states` · `Group` · `Group states` · `Keyboard` (Tab, Space; skips disabled).

## 5. Known issues

- **Code gap:** CheckboxField's `Label` (a field title above the control, `Has label`) has no code prop. The code's `label` is Figma's `Value`.
- **Out of scope:** truncate. The Usage doc says it isn't exposed yet.
