---
name: accordion-story
description: >
  Build or refresh Accordion's Storybook stories and docs page from the
  "↳ accordion" Figma page, covering only what that page has. Trigger on
  "accordion stories", "build storybook for accordion". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Accordion/Accordion.tsx
---

# Accordion: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ accordion`, `236:1534` |
| ComponentSet | `AccordionItem` `236:1875` |
| Examples | Single-expand (Bordered) · Multiple-expand (Borderless) |
| Doc frames | `Documentation / Usage` `1333:182` · `Style` `1333:457` · `Accessibility` `1333:814` |
| Output | `src/components/Accordion/Accordion.stories.tsx` + `Accordion.mdx`, title `Components/Accordion` |

## 2. Figma snapshot (2026-11-10)

**10 variants** = Style (Bordered · Borderless) × State (Default · Hover · Focused · Expanded · Disabled).

Item width is a fixed 360px. The sample questions are "What is your return policy?", "How long does shipping take?" and "Do you ship internationally?".

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Style | `variant` |
| Expand mode (doc behaviour) | `expandMode` |
| Heading h2–h4 (doc) | `headingLevel` |
| Expanded | `defaultValue` |
| Disabled | `AccordionItem disabled` |

The stories use a flat `Args` type (`open: string[]`, `disabledItem`) because Accordion's props are a single/multiple union, which Storybook's `Meta` can't type.

**Out of scope, not exposed:** `hasIcon` (Figma: every item shows its icon), `collapsible`.

## 4. Stories

`Single-expand` (play: opening one closes the other) · `Multiple-expand` · `Styles` · `Disabled` · `Keyboard` (Enter, ↓, End, Home) · `Do & don't`.

## 5. Known issues

- The doc mentions a `contentType` (text / complex padding), but it isn't storied: there's no visual Figma example.
- One "Don't" case (two panels open in single mode) can't be rendered by the component, so it's a caption only.
