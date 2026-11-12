---
name: date-picker-story
description: >
  Build or refresh Date Picker's Storybook stories and docs page from the
  "↳ Date Picker" Figma page, covering only what that page has. Trigger on
  "date-picker stories", "build storybook for date picker". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/DatePicker/DatePicker.tsx
---

# Date Picker: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ Date Picker`, `620:46` |
| ComponentSet | `Date Picker` `660:4998` |
| Examples | `660:5115`: Single, Range with presets + footer, DateTime |
| Doc frames | a single `Documentation` frame, `1009:669` |
| Output | `src/components/DatePicker/DatePicker.stories.tsx` + `DatePicker.mdx`, title `Components/Date Picker` |

## 2. Figma snapshot (2026-11-10)

**21 variants** = Type (Single · Range · DateTime) × State (Default · Hover · Focused · Filled · Disabled · Read-only · Error).

There's one boolean, `Show Calendar` (default false). Sample dates: 07/30/2026; range 07/20–08/05/2026; 07/30/2026 2:30 PM.

## 3. Property → prop mapping

DatePicker's props are a union, so the stories use a flat `Args` type and render the matching variant:

| Figma | Story arg |
|---|---|
| Type | `type` |
| Filled | `filled` (sets `defaultValue`) |
| Disabled | `disabled` |
| Read-only | `readOnly` |
| Error | `error` |
| Show Calendar | the `Show calendar` story opens the popover |

The popover renders in a portal, so queries use `screen`, not `canvas`.

## 4. Stories

`Default` · `Types` · `States` · `Show calendar` · `Keyboard` (Escape closes).

## 5. Known issues

- **Code gap:** the presets are Last 7 days, Last 30 days and This month. Figma has 6: it also has Today, Yesterday and Last month.
- **Figma doc:** Flags says "No gaps identified".
- **Not from Figma:** field labels ("Date", "Dates"…). `DatePicker` requires a visible `label` and Figma's fields have none. The Error state is shown by typing Figma's invalid value 13/45/2026, so the message is the code's own validation text.
