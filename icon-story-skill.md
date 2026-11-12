---
name: icon-story
description: >
  Build or refresh Icon's Storybook stories and docs page from the
  "↳ Icons" Figma page and the "icons" variable collection, covering only
  what Figma has. Trigger on "icon stories", "build storybook for icons".
  Follows the shared contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Icon/Icon.tsx, src/components/Icon/icons.ts
---

# Icon: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ Icons`, `109:17`. There's no ComponentSet: 132 standalone `Icon/{category}/{name}/{16\|20\|24}` components. |
| Doc frames | a single `Documentation` frame, `990:7` |
| Variables | the `icons` collection: `icon/size/{sm,md,lg}`, `icon/stroke/{sm,md,lg}`, and 8 `icon/color/*` |
| Output | `src/components/Icon/Icon.stories.tsx` + `Icon.mdx`, title `Components/Icon` |

## 2. Figma snapshot (2026-11-10)

**44 icon names × 3 sizes.** The names match `src/components/Icon/icons.ts` exactly; re-diff them on every run.

The 8 colours are: default, subtle, inverse, on-brand, danger, success, warning, info.

## 3. Property → prop mapping

| Figma | React | Notes |
|---|---|---|
| Icon name | `name` | |
| Size 16 / 20 / 24 | `size="sm" \| "md" \| "lg"` | |
| `icon/color/*` | `color` | |
| Doc: accessible name | `label` | |

**Out of scope, removed from control options:**
- the `xs` and `xl` sizes: Figma's Flags note they aren't built;
- the `current` colour.

## 4. Stories

`Default` · `Representative` (one icon per category × 3 sizes) · `Sizes` · `Colors` · `Meaningful` (play: role `img`) · `Gallery`.

## 5. Known issues

- **Figma doc:** says "43 semantic icons", but 44 are built.
- **Figma doc:** the Token Map mentions xs and xl sizes, which aren't in the collection.
