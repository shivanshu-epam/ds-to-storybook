---
name: divider-story
description: >
  Build or refresh Divider's Storybook stories and docs page from the
  "↳ divider" Figma page, covering only what that page has. Trigger on
  "divider stories", "build storybook for divider". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Divider/Divider.tsx
---

# Divider: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ divider`, `509:3` |
| ComponentSet | `Divider`, `697:1083` |
| Doc frames | a single `Documentation` frame, `975:3` |
| Output | `src/components/Divider/Divider.stories.tsx` + `Divider.mdx`, title `Components/Divider` |

## 2. Figma snapshot (2026-11-10)

**540 variants**:

| Property | Options |
|---|---|
| Orientation | Horizontal · Vertical |
| Style | Solid · Dotted · Dash |
| Size | Sm · Md |
| Color | Light · Dark · Subtle · Transparent · Danger · Success · Neutral · Warning · Info |
| State | Default · Hover · Focused · Selected · Disabled |

The default variant is Horizontal / Solid / Sm / Light / Default.

Doc sections: Anatomy, Variants & States (Color × Style grid on a mid-grey backdrop), State zoomed callout, Token Map, Behaviour & Accessibility, Flags ("No gaps identified").

## 3. Property → prop mapping

| Figma | React | Notes |
|---|---|---|
| Orientation | `orientation` | |
| Style | `lineStyle` | |
| **Size** | **`length="sm" \| "md"`** | Figma Size is the hug length (Sm 24px, Md 48px), not thickness. |
| Color | `color` | |
| State | `state` | Focused and Selected draw the 2px line. |
| role=separator / aria-hidden (doc) | `decorative` | |

**Out of scope, hidden:**
- `size`: the code's thickness prop. In Figma, thickness comes from State.
- `length="fill"`: Figma hugs only. It's removed from the control options.

## 4. Stories

`Default` · `Colors & styles` (grid) · `States` · `Sizes` · `Orientation` · `Semantics`. The `Semantics` play checks there's exactly one `separator` role.

Each line sits on a mid-grey `Band` (`--color-gray-400`), as in Figma. Put the band behind the line only: captions placed on it fail the contrast gate.

## 5. Known issues

- **Figma doc:** the page label says "Orientation × Style × Size × Color × **Sentiment** × State", but there's no Sentiment axis. The doc body says five axes.
- **Code gap:** the code's `size` prop sets thickness, which Figma doesn't have as a property.
