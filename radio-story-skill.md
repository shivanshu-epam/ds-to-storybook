---
name: radio-story
description: >
  Build or refresh Radio's Storybook stories and docs page from the
  "↳ Radio" Figma page, covering only what that page has. Trigger on
  "radio stories", "build storybook for radio". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Radio/Radio.tsx
---

# Radio: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ Radio`, `371:3` |
| ComponentSets | `RadioControl` `521:2681` · `RadioField` `522:125` · `RadioGroup` `529:749` |
| Doc frames | `Documentation / Usage` `1344:351` · `Style` `1344:699` · `Accessibility` `1344:1389` |
| Output | `src/components/Radio/Radio.stories.tsx` + `Radio.mdx`, title `Components/Radio` (meta component: `RadioGroup`) |

## 2. Figma snapshot (2026-11-10)

**RadioControl (17 variants):**
- State: Enabled · Hovered · Focused · Pressed · Disabled · Skeleton · Read-Only · Invalid · Warning
- Selected: false · true (there's no Read-Only + unselected variant)

**RadioField (14 variants):** State × Position (Left · Right).

**RadioGroup (8 variants):** State (Enabled · Read-Only · Invalid · Warning) × Horizontal.

**Sample group:** "Delivery speed": Standard (5-7 days) / Express (2-3 days) / Overnight.

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Group label | `legend` |
| Horizontal | `orientation` |
| Read-Only | `readOnly` + `defaultValue` |
| Invalid | `error` ("Please select an option") |
| Warning | `warning` ("This selection may need review") |
| Disabled | `disabled` |
| Position Right | `labelPosition="left"` (value before control) |
| Skeleton | `Radio loading` |

**Out of scope, hidden:** `helperText`, `required`.

## 4. Stories

`Default` · `Horizontal` · `Position` · `Group states` · `Field states` · `Keyboard` (arrow keys).

## 5. Known issues

- **Figma doc:** typography isn't bound to tokens, and the outer circle fill isn't token-bound.
