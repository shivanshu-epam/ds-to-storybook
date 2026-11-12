---
name: form-story
description: >
  Build or refresh Form's Storybook stories and docs page from the
  "↳ Form" Figma page, covering only what that page has. Trigger on
  "form stories", "build storybook for form". Follows the shared
  contract in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-10
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/TextInput/TextInput.tsx (InputControl / InputField), composed with Select, Checkbox, Button, Alert
---

# Form: Storybook from Figma

## 1. Figma source

| | |
|---|---|
| Page | `↳ Form`, `427:3` |
| ComponentSets | `InputControl` `427:2001` (9 states) · `InputField` `428:2042` (6) · `Form` `435:8` (5) |
| Examples | `436:282`: "Shipping address", multi-column |
| Doc frames | a single `Documentation` frame, `1021:263` |
| Output | `src/components/Form/Form.stories.tsx` + `Form.mdx` (a stories-only folder), title `Components/Form` |

## 2. Figma snapshot (2026-11-10)

- **InputControl:** Default · Hover · Focused · Filled · Disabled · Read-only · Error · Success · "State9".
- **InputField:** Default · Focused · Invalid · Success · Disabled · Read-only. Booleans `Required` and `Helper Message`. Text: "Email address", "Enter your email", "We'll never share your email", "Enter a valid email address", "Email verified".
- **Form:** Default · Submitting · Success · Error · Disabled.

## 3. Mapping

There's no Form component in code. Figma's Form is itself a composition of InputField and Button instances, so the stories compose the real components:

| Figma | Rendered with |
|---|---|
| InputControl | `TextInput hideLabel` |
| InputField | `TextInput` (`helperText`, `error`, `success`, `disabled`, `readOnly`, `required`) |
| Form | `TextInput`, `Select`, `Checkbox` and `Button`, plus an `Alert` banner for Success and Error |

## 4. Stories

`InputControl states` · `InputField states` · `Form states` (play: the Submitting button is disabled) · `Multi-column example`.

## 5. Known issues

- **Figma doc Flags:**
  - there's no component skill for this page;
  - the state named "State9" is unexplained;
  - it overlaps with the `↳ Input` page.
- **Code gap:** InputControl's Error and Success styling needs a message in code. Those rows are shown on InputField rather than faked with a blank message.
- **Code gap:** there's no Form component. The page-level submission states are compositions.
