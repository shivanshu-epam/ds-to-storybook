---
name: carousel-story
description: >
  Build or refresh Carousel's Storybook stories and docs page from the
  "↳ carousel" Figma page, covering only what that page has. Trigger on
  "carousel stories", "build storybook for carousel". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Carousel/Carousel.tsx
---

# Carousel: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ carousel`, `241:3` |
| ComponentSets | `NavControl` `241:1812` (Direction × State, 8) · `PaginationDot` `241:1815` (Default · Active) · `AutoplayToggle` `241:1883` (Playing · Paused) |
| Examples | Standard ("Slide 1 of 3") · Autoplay · Multi-item ("Item A", "Item B") |
| Doc frames | `Documentation / Usage` `1336:73` · `Style` `1336:417` · `Accessibility` `1336:649` |
| Output | `src/components/Carousel/Carousel.stories.tsx` + `Carousel.mdx`, title `Components/Carousel` |

## 2. Property → prop mapping

There's no Carousel ComponentSet: Figma assembles one from the three sets. The doc's behaviour options map to props:

| Figma behaviour option | React |
|---|---|
| infinite / finite | `infinite` |
| multi-item | `slidesPerView` |
| autoplay | `autoplay`, `autoplayInterval` (≥ 4000, default 5000) |
| slide / fade | `transition` |

**Out of scope, hidden:** `spacing`, `showNavigation`, `showPagination`. These are used only to render the "hide navigation" Don't.

## 3. Stories

`Standard` (play: the edge controls disable) · `Autoplay` (play: pause) · `Multi-item` · `Infinite` · `Fade` · `Keyboard` · `Do & don't`.

## 4. Known issues

- **Code gap:** the doc's "vertical" option isn't supported in code.
- **Code gap:** the doc's Loading slide placeholders have no code prop.
- The "autoplay without pause" Don't can't be rendered, because the code always shows the pause control. It's a caption only.
- **Not from Figma:** the carousels' accessible names ("Featured"…) are required by code. They're not visible.
