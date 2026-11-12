---
name: button-story
description: >
  Build or refresh Button's Storybook stories and docs page from the
  "↳ button" Figma page, covering only what that page has. Trigger on
  "build storybook for button", "button stories", "sync button storybook
  with Figma". Follows the shared contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-05
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Button/Button.tsx, src/components/IconButton/IconButton.tsx
---

# Button: Storybook from Figma

Run the workflow in [skill.md](skill.md) §3. This file pins what's specific to Button.

## 1. Figma source

| | |
|---|---|
| File | `I983NcgqSiY14YkpJbwjG8` |
| Page | `↳ button`, `99:2` |
| ComponentSet | `Button`, `102:122` |
| Doc frames | `Documentation / Usage` `1320:168` · `Documentation / Style` `1320:507` · `Documentation / Accessibility` `1320:1020` |
| Output | `src/components/Button/Button.stories.tsx` + `Button.mdx`, title `Components/Button` |

## 2. Figma snapshot (2026-11-05)

Diff the live read against this table (skill.md §3 Step 2).

**180 variants** = Variant (4) × Size (3) × State (5) × Radius (3).

| Figma property | Type | Options / default |
|---|---|---|
| Variant | VARIANT | Primary · Secondary · Ghost · Danger |
| Size | VARIANT | Sm · Md · Lg |
| State | VARIANT | Default · Hover · Pressed · Focused · Disabled |
| Radius | VARIANT | Default · Rounded · None |
| Has leading icon | BOOLEAN | false |
| Has trailing icon | BOOLEAN | false |
| Show label | BOOLEAN | true |

Doc sections:
- **Usage:** Overview, When to use / not, Anatomy (Container, Icon, Label), Sizes, Alignment (leading / trailing / icon-only), Placement + 3 Do/Don't pairs, Content, States, Interactions (mouse, keyboard), Loading.
- **Style:** Color token table, Typography, Structure, Radius, Variants & states grid (Variant × State at Md / Default radius), Focus zoom, Icons.
- **Accessibility:** What the DS provides, Development considerations, Keyboard table, contrast table.

## 3. Property → prop mapping

| Figma | React | Notes |
|---|---|---|
| Variant = Primary/Secondary/Ghost/Danger | `variant="primary" \| "secondary" \| "ghost" \| "danger"` | |
| Size = Sm/Md/Lg | `size="sm" \| "md" \| "lg"` | Figma default variant is **Sm**. Code default is `md`. Set meta `args.size: 'sm'` to match Figma's default. |
| Radius = Default/Rounded/None | `radius="default" \| "rounded" \| "none"` | |
| State = Disabled | `disabled` | |
| State = Focused | play: `userEvent.tab()` | Assert `toHaveFocus()`. |
| State = Hover / Pressed | pseudo-state | Follow skill.md §4 States. Don't fake them with classes. |
| Has leading icon | `leadingIcon: IconName` | Story control: `select` over `iconNames`. |
| Has trailing icon | `trailingIcon: IconName` | Code ignores trailing when leading is set, which matches "never both". |
| Show label = off | `<IconButton icon label>` | Icon-only is the IconButton component. Render it inside Button's `WithIcons` story, with the Figma caption "Must have an accessible label". |
| Label text | `children` | Figma sample: "Button". The Do/Don't pairs use "Save", "Cancel", "Publish", "Delete". |

**Out of Figma scope. Don't story these, and hide them from Controls:**

| Prop | Why it's out |
|---|---|
| `loading` | Figma Usage says the loading indicator "is not built yet". Drop the current `Loading` story. |
| `fullWidth` | Figma Placement says it's "not exposed as a Figma property yet". Drop the current `FullWidth` story. |
| `size="xs"` | Figma has Sm/Md/Lg only. Restrict the `size` control: `options: ['sm','md','lg']`. |
| `type` | Not a Figma property. Leave it at the default `button`. The Accessibility tab's guidance is quoted in the docs. |

## 4. Stories to build

| Story | Shows | Figma source |
|---|---|---|
| `Default` | Primary / Sm / Default radius, label "Button". Play: click calls `onClick` once. | Set default variant; Usage › Interactions › Mouse |
| `VariantsAndStates` | Grid: rows Primary / Secondary / Ghost / Danger × columns Default · Disabled (plus Hover / Pressed / Focused only if pseudo-states are approved), at Md / Default radius. Only one element can hold focus, so Focused can't be a grid column without the add-on. | Style › Variants & states |
| `Focused` | Md. Play: `userEvent.tab()` and assert `toHaveFocus()`. The description tells viewers to click the canvas and press Tab, because the ring is `:focus-visible` only and doesn't render until the preview iframe has window focus. | Style › Focus |
| `Sizes` | Sm · Md · Lg side by side, with captions "Small · 32px", "Medium · 40px", "Large · 48px" and their usage lines. | Usage › Sizes |
| `Radius` | Default · Rounded · None. | Style › Radius |
| `WithIcons` | Leading icon · Trailing icon · Icon only (IconButton). | Usage › Alignment |
| `Disabled` | `disabled`. Play: a click doesn't call `onClick`. | Usage › Interactions › Mouse ("Disabled buttons ignore clicks") |
| `KeyboardActivation` | Play: Tab focuses it (`toHaveFocus`); Enter activates; Space activates. | Accessibility › Keyboard interactions |
| `DoDont` | Docs-only (`tags: ['!dev']`). Renders the 3 Do/Don't pairs from Placement. | Usage › Placement |

## 5. Docs page content (`Button.mdx`)

- **Subtitle:** "A button triggers an immediate action, such as submit, confirm, open or delete."
- **Usage:**
  - Overview, including the line "Use buttons for actions only…".
  - When to use / When not to use.
  - Anatomy list ①–③. Drop the "Not shown: loading indicator" line; it's out of scope.
  - Sizes (embed `Sizes`), Alignment (embed `WithIcons`), Placement (embed `DoDont`).
  - Content › Label / Icon bullets.
  - States list. Drop the Loading bullet.
  - Interactions (Mouse, Keyboard).
  - **Leave out** the Loading section.
- **Style:**
  - Color token table, with all 20 rows verbatim.
  - Typography table.
  - Structure table, then Radius (embed `Radius`).
  - Variants & states (embed `VariantsAndStates`).
  - The Focus sentence ("3px ring bound to border/interactive/focus").
  - Icons.
- **Accessibility:**
  - What the design system provides.
  - Development considerations. Drop the "While loading…" bullet.
  - Keyboard table and the focus-visible sentence.

## 6. Known issues to report each run (until Figma changes)

- **Blocking (contrast, from Figma Accessibility tab):** Ghost · Default / Focused 1.41:1 (project-a light). Primary · Default 3.28:1 (project-b). Several Disabled states are below 3:1. The focus ring is 1.0–2.58:1 against Primary / Danger fills. The a11y addon will flag these. Follow skill.md §3 Step 6.
- **Figma doc issue:** Usage › Live demo says "no interactive source (Storybook…) is linked yet". Offer a 05-documentation-agent update once the stories ship.
