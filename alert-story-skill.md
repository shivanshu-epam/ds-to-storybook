---
name: alert-story
description: >
  Build or refresh Alert's Storybook stories and docs page from the
  "↳ alert" Figma page, covering only what that page has. Trigger on
  "build storybook for alert", "alert stories", "sync alert storybook with
  Figma". Follows the shared contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-05
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Alert/Alert.tsx
  - agents/08-storybook-agent/button-story-skill.md (action/close controls are Buttons)
---

# Alert: Storybook from Figma

Run the workflow in [skill.md](skill.md) §3. This file pins what's specific to Alert.

## 1. Figma source

| | |
|---|---|
| File | `I983NcgqSiY14YkpJbwjG8` |
| Page | `↳ alert`, `293:5` |
| ComponentSet | `Alert`, `516:2837` |
| Doc frames | `Documentation / Usage` `1340:767` · `Documentation / Style` `1340:1159` · `Documentation / Accessibility` `1340:1663` |
| Output | `src/components/Alert/Alert.stories.tsx` + `Alert.mdx`, title `Components/Alert` |

## 2. Figma snapshot (2026-11-05)

**40 variants** = Sentiment (5) × Size (2) × State (4). There are no boolean, text or instance-swap properties.

| Figma property | Type | Options |
|---|---|---|
| Sentiment | VARIANT | Neutral · Info · Success · Warning · Danger |
| Size | VARIANT | Sm · Md |
| State | VARIANT | Default · With Action · With Close · With Action + Close |

Doc sections:
- **Usage:**
  - Overview: Sentiments, Configurations.
  - Anatomy: Container, Leading icon, Headline, Supporting text, Action button, Close button.
  - Sizes, plus the density note (Compact / Comfortable / Spacious modes of `component.alert.density`).
  - One Do/Don't pair.
  - Content, including an Overflow note: truncate is "not exposed as a Figma property yet".
  - Behaviors: States, Interactions, Keyboard.
  - Related.
- **Style:** Color token table, Typography, Structure (width 400, 1px border), Variants & states grid (Sentiment × State at Md), Icons.
- **Accessibility:** What the DS provides, Development considerations, Keyboard table, contrast table.

## 3. Property → prop mapping

| Figma | React | Notes |
|---|---|---|
| Sentiment | `sentiment="neutral" \| "info" \| "success" \| "warning" \| "danger"` | The Figma default variant is **Neutral** (Live demo). The code default is `info`, so set meta `args.sentiment: 'neutral'`. |
| Size = Sm/Md | `size="sm" \| "md"` | The Figma default variant is **Sm**, so set meta `args.size: 'sm'`. |
| State = Default | no `action`, no `onClose` | |
| State = With Action | `action={{ label, onClick: fn() }}` | Renders as a Ghost / Sm Button, which matches the Figma anatomy. |
| State = With Close | `onClose={fn()}` | Close button accessible name: "Dismiss". |
| State = With Action + Close | both | |
| Headline | `title` | Required. |
| Supporting text | `description` | Optional. |
| Density (doc-only: `component.alert.density` modes) | `density="compact" \| "comfortable" \| "spacious"` | In scope because a Figma doc frame documents it. Cite Usage › Sizes. |
| Leading icon (fixed per sentiment) | automatic | Hide `hasIcon` from Controls: Figma has no "hide icon" option. |

**Out of Figma scope. Don't story these, and hide them from Controls:**

| Prop | Why it's out |
|---|---|
| `truncate` | Figma Content › Overflow says it "isn't exposed as a Figma property yet". Drop the current `Truncated` story. |
| `hasIcon` | Every Figma variant has the icon. |
| `action.loading` | The doc mentions it under Interactions, but it's inherited from Button, and Button's loading state is out of Figma scope (see button-story-skill §3). Don't story it. Report it once as a dependency. |

## 4. Sample content (use verbatim, per sentiment)

| Sentiment | Headline | Supporting text | Action label |
|---|---|---|---|
| Neutral | Draft saved | Your changes are stored locally. | Undo |
| Info | Update available | Version 4.2 is ready to install. | Update now |
| Success | Payment received | Invoice #4021 marked as paid. | View receipt |
| Warning | Storage almost full | 92% of your quota is in use. | Manage storage |
| Danger | Sync failed | Check your connection and retry. | Retry |

Put this in a `SAMPLE` const in the stories file and reuse it in every story.

## 5. Stories to build

Use a decorator to fix the width at 400px (Style › Structure: "Width 400").

| Story | Shows | Figma source |
|---|---|---|
| `Default` | Neutral / Sm / Default, "Draft saved". | Usage › Live demo |
| `Sentiments` | All 5 sentiments stacked, at Md / Default. | Usage › Overview › Sentiments |
| `Configurations` | Info: Default · With Action · With Close · With Action + Close. | Usage › Overview › Configurations |
| `SentimentsAndStates` | Grid: Sentiment rows × State columns at Md. | Style › Variants & states |
| `Sizes` | Sm and Md, both Info. | Usage › Sizes |
| `Densities` | Compact · Comfortable · Spacious. | Usage › Sizes (density note) |
| `Dismiss` | Danger, With Action + Close. Play: get the element with `role="alert"`; click "Dismiss"; `onClose` is called once and the alert is removed. | Usage › Interactions › Close |
| `ActionAndKeyboard` | Info, With Action + Close. Play: Tab focuses the action, then Tab focuses Dismiss; Enter on the action calls its `onClick`. | Accessibility › Keyboard interactions |
| `DoDont` | Docs-only (`tags: ['!dev']`). Do: Ghost / Sm action. The Don't side shows a caption only: don't render a large primary inside Alert, because the component can't render that. | Usage › Do/Don't |

Live-region roles: the code uses `role="alert"` for Danger and Warning and `role="status"` for the others. That matches the Accessibility › Development considerations, so assert it in `Sentiments` with `getAllByRole`.

## 6. Docs page content (`Alert.mdx`)

- **Subtitle:** "An alert shows a short, sentiment-coded message inline on the page, with an optional action and close button."
- **Usage:**
  - Overview (embed `Sentiments` and `Configurations`).
  - Anatomy ①–⑥.
  - Sizes (embed `Sizes` and `Densities`).
  - Do/Don't.
  - Content: Headline and Supporting text. Overflow says "Text wraps." **Leave out** the truncate sentence.
  - Behaviors: States, Interactions. **Leave out** "while it's running, the action button shows its loading state."
  - Keyboard.
  - Related: Button links to `?path=/docs/components-button--docs`. Dialog: plain text, no link, unless a Dialog story exists.
- **Style:**
  - Color table, with all 5 rows.
  - Typography, including the note "Text isn't bound to typography tokens yet".
  - Structure table.
  - Variants & states (embed `SentimentsAndStates`).
  - Icons.
- **Accessibility:**
  - What the DS provides.
  - Development considerations. **Leave out** the loading bullet and the truncation bullet.
  - Keyboard table.

## 7. Known issues to report each run (until Figma changes)

- **Blocking (contrast, from Figma Accessibility tab):** Borders are below 3:1 in project-a light for every sentiment (1.08–1.50:1). The Figma doc attributes this to `surface/bg/default` resolving to blue via the `gray/50` token. This is a token issue for 02-variable-agent, not for this skill.
- **Figma doc issues:**
  - Typography isn't token-bound in Figma.
  - Live demo says no Storybook is linked yet.
  - Offer a 05-documentation-agent update.
