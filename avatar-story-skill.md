---
name: avatar-story
description: >
  Build or refresh Avatar's Storybook stories and docs page from the
  "↳ avatar" Figma page, covering only what that page has. Trigger on
  "avatar stories", "build storybook for avatar". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/Avatar/Avatar.tsx
---

# Avatar: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ avatar`, `273:894` |
| ComponentSets | `AvatarGlyph` `276:1716` · `AvatarIdentity` `274:1803` |
| Doc frames | `Documentation / Usage` `1337:116` · `Style` `1337:388` · `Accessibility` `1337:800` |
| Output | `src/components/Avatar/Avatar.stories.tsx` + `Avatar.mdx`, title `Components/Avatar` |

## 2. Figma snapshot (2026-11-10)

**AvatarGlyph (21 variants):**
- Type: Text · Icon · Image
- Color: 1–5
- Size: Sm · Md · Lg (24 / 32 / 40px)
- Icon swap: `Icon/user/profile`

**AvatarIdentity (6 variants):**
- State: Default · Hover · Focused · Active · Disabled · Selected
- Booleans: `Has name`, `Has email`, `Has trailing icon`
- Text: Name "Alex Johnson", Email "alex.johnson@acme.com"

## 3. Property → prop mapping

| Figma | React |
|---|---|
| Type=Text | `name` |
| Type=Icon | `icon` |
| Type=Image | `src` |
| Color | `color` |
| Size | `size` |
| AvatarIdentity | `AvatarIdentity` (`email`, `trailingIcon`, `onClick`, `selected`, `disabled`) |

**Out of scope, hidden:** `shape` (square), `badge`, `status` (presence), and `AvatarGroup`. Group overflow is mentioned only in an a11y note, and there's no Figma component for it.

## 4. Stories

`Default` · `Content types` · `Colors & sizes` (grid) · `Identity` · `Identity states` · `Keyboard` · `Do & don't`.

## 5. Known issues

- **Image avatar:** uses an inline SVG stand-in photo, because Figma uses an image fill with no exportable asset.
- **Not storied:** Type=Image, because Figma's image fill has no exportable asset.
