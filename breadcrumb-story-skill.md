---
name: breadcrumb-story
description: >
  Build or refresh Breadcrumb's Storybook stories and docs page from the
  "↳ breadcrumb" Figma page, covering only what that page has. Trigger on
  "breadcrumb stories", "build storybook for breadcrumb". Follows the
  shared contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Breadcrumb/Breadcrumb.tsx
---

# Breadcrumb: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ breadcrumb`, `224:3` |
| ComponentSets | `BreadcrumbItem` `224:1461` (8 variants) · `Separator` `224:1467` (2) |
| Examples | Standard, Truncated, Icon-based, Mobile, Slash Separator |
| Doc frames | `Documentation / Usage` `1332:152` · `Style` `1332:578` · `Accessibility` `1332:836` |
| Output | `src/components/Breadcrumb/Breadcrumb.stories.tsx` + `Breadcrumb.mdx`, title `Components/Breadcrumb` |

## 2. Figma snapshot (2026-11-10)

**BreadcrumbItem:**
- Type: Link · Current · Collapse
- State: Default · Hover · Focused · Disabled
- `Has icon` boolean
- `Label` text, "Breadcrumb"

**Separator:** Type Slash · Chevron.

**Sample trail:** Home › Products › Laptops › ThinkPad X1.

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Item list (Link…, then Current) | `items` (the last item is the current page) |
| Separator | `separator` |
| Collapse / overflow | `maxItems`, `itemsBeforeCollapse`, `itemsAfterCollapse` |
| Has icon | `items[].icon` |
| Link: Disabled | `items[].disabled` |

**Out of scope, hidden:** `renderLink`, `className`.

## 4. Stories

`Standard` · `Truncated` (play: expand) · `Icon-based` · `Separators` · `Small screens` · `Disabled link` · `Keyboard` · `Do & don't`.

The Separators and Do & don't stories render several trails at once, so they disable axe's `landmark-unique` rule. A real page has one trail. Two "Don't" cases (current page styled as a link, mixed separators) can't be rendered by the component, so they're captions only.

## 5. Known issues

- **Contrast (Figma Accessibility tab):** link and focus ring are 1.41:1 and the chevron 1.08:1 in project-a / light.
- **Figma doc:** says long labels truncate with a tooltip; the code uses a `title` attribute.
