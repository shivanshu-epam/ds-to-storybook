---
name: badge-story
description: >
  Build or refresh Badge's Storybook stories and docs page from the
  "↳ badge" Figma page, covering only what that page has. Trigger on
  "badge stories", "build storybook for badge". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Badge/Badge.tsx
---

# Badge: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ badge`, `211:3` |
| ComponentSet | `Badge`, `211:1961` |
| Doc frames | `Documentation / Usage` `1330:140` · `Style` `1330:491` · `Accessibility` `1330:933` |
| Output | `src/components/Badge/Badge.stories.tsx` + `Badge.mdx`, title `Components/Badge` |

## 2. Figma snapshot (2026-11-10)

**135 variants**:

| Property | Options / default |
|---|---|
| Status | Success · Warning · Error · Info · Neutral |
| Style | Filled · Outlined · Subtle |
| Type | Text · Numeric · Dot |
| Size | Sm · Md · Lg |
| Has leading icon | boolean, default false (icon `Icon/feedback/star`) |
| Is dismissible | boolean, default false |
| Label | text, "Label" |

The default variant is Success / Filled / Text / Sm.

## 3. Property → prop mapping

| Figma | React | Notes |
|---|---|---|
| Status | `status` | |
| Style | `variant` | |
| Type | `type` | |
| Size | `size` | |
| Label | `label` | |
| Has leading icon | `icon` | |
| Is dismissible | `onDismiss` | |
| Doc: count, max-count, show zero | `count`, `maxCount`, `showZero` | |
| Doc: accessible meaning for dots | `aria-label` | |

The code defaults (`neutral` / `subtle` / `md`) differ from Figma's, so the meta args set Figma's defaults.

## 4. Stories

`Default` · `Types` · `Statuses & styles` (grid) · `Types & statuses` (grid) · `Sizes` · `Icon & dismiss` · `Dismiss` (play: Tab then Enter) · `Counts` (99+) · `Overflow` · `Do & don't` (docs only).

## 5. Known issues

- **Not storied:** the doc mentions Hover, Focus and Disabled for a "clickable badge", but there's no Figma variant and no code prop for it.
- **Contrast (Figma Accessibility tab):** Filled badges in project-a / light are measured at 1.12–2.31:1. Subtle dots in dark are 1.25–1.37:1.
