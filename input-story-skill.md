---
name: input-story
description: >
  Build or refresh Input's Storybook stories and docs page from the
  "↳ Input" Figma page, covering only what that page has. Trigger on
  "build storybook for input", "text input stories", "input field
  storybook", "sync input storybook with Figma". Follows the shared contract
  in agents/08-storybook-agent/skill.md.
version: 1.0.0
last_updated: 2026-11-05
references:
  - agents/08-storybook-agent/skill.md (shared contract — read first)
  - src/components/TextInput/TextInput.tsx (React name differs from Figma's "Input")
  - src/components/FormLabel/FormLabel.tsx (label + helper text)
---

# Input: Storybook from Figma

Run the workflow in [skill.md](skill.md) §3. This file pins what's specific to Input.

The Figma component is **Input**; the React component is **`TextInput`** (in `src/components/TextInput/`). The Storybook title follows Figma: `Components/Input`. Changing the title changes the story URLs from `components-text-input--*` to `components-input--*`. Mention this at the HITL checkpoint.

## 1. Figma source

| | |
|---|---|
| File | `I983NcgqSiY14YkpJbwjG8` |
| Page | `↳ Input`, `827:3` |
| ComponentSet | `Input`, `836:4005` |
| Doc frames | a single `Documentation` frame, `1026:5643` (no Usage / Style / Accessibility tabs) |
| Other nodes on page | `Input` instance `893:170`; `Input Field` instance `838:3163`; page-title / description text. Read the page-description text too: it's part of the documentation. |
| Output | `src/components/TextInput/TextInput.stories.tsx` + `TextInput.mdx`, title `Components/Input` |

## 2. Figma snapshot (2026-11-05)

**60 variants** = Type (4) × Size (3) × State (5).

| Figma property | Type | Options / default |
|---|---|---|
| Type | VARIANT | Outlined · Filled · Borderless · Inline |
| Size | VARIANT | Sm · Md · Lg |
| State | VARIANT | Default · Hover · Focus · Disabled · Error |
| Label | TEXT | "Label" |
| Placeholder | TEXT | "Placeholder text" |
| Helper text | TEXT | "We'll never share this." |
| Required | BOOLEAN | true |
| Show leading icon | BOOLEAN | true |
| Leading icon | INSTANCE_SWAP | `109:96` (Icons page; resolve its name on read) |
| Show trailing icon | BOOLEAN | false |
| Trailing icon | INSTANCE_SWAP | `109:96` |
| Clearable | BOOLEAN | false |
| Show character count | BOOLEAN | false |
| Character count | TEXT | "0/100" |

The ComponentSet `description` explicitly says that Read-only, Warning, Success and Loading **are not baked**.

Doc sections, in order:
1. Anatomy (Label, Container, Helper text)
2. Variants & States (Type × State grid at Md)
3. Content Guidance
4. Token Map
5. Do's and Don'ts
6. Flags

## 3. Property → prop mapping

| Figma | React (`TextInput`) | Notes |
|---|---|---|
| Type | `variant="outlined" \| "filled" \| "borderless" \| "inline"` | |
| Size | `size="sm" \| "md" \| "lg"` | |
| State = Disabled | `disabled` | |
| State = Error | `error="…"` | Error text replaces the helper text in the message slot. Pass `helperText={undefined}` when you set `error`. |
| State = Focus | play: `userEvent.tab()` | Assert `toHaveFocus()`. Content Guidance requires a visible focus indicator **even on Borderless**. |
| State = Hover | pseudo-state | Follow skill.md §4 States. |
| Label | `label` | |
| Placeholder | `placeholder` | |
| Helper text | `helperText` | |
| Required | `required` | Meta default `true`, matching Figma. |
| Show leading icon + Leading icon | `prefix: IconName` | Icon names only: put a `select` control over `iconNames`. Default: the icon Figma's `109:96` resolves to (the Outlined / Default example shows a search icon). |
| Show trailing icon + Trailing icon | `suffix: IconName` | Icon names only. |
| Clearable | `clearable` (+ `onClear`) | The clear button appears only once there's content (Do's and Don'ts). |
| Show character count + Character count | `showCount` + `maxLength={100}` | The Figma sample "0/100" means max 100. |

**Out of Figma scope. Don't story these, and hide them from Controls:**

| Prop / story | Why it's out |
|---|---|
| `warning`, `success` | The set description says they're not baked, and the Flags list Warning as absent. Drop them from the current `Status` story. |
| `readOnly` | Not baked. Drop the read-only half of the current `States` story. |
| `loading`, `onSearch`, `type="search"` | Loading isn't baked. The search variant isn't a component ("no corresponding component observed"). Drop the current `Search` story. |
| `type="password"` | Not observed. Drop the current `Password` story. |
| `TextArea` | Not observed. Drop the current `MultiLine` story. |
| `prefix` / `suffix` as **text** (e.g. "$", "kg") | Figma has icon slots only. Drop the current `PrefixSuffix` text cases. |
| `hideLabel` | Not a Figma property. Figma's label is "persistent, always paired". |

## 4. Stories to build

Use a decorator capping width at 260px, the Figma instance width.

| Story | Shows | Figma source |
|---|---|---|
| `Default` | Outlined / Md: Label, required, placeholder, helper text, leading icon. Play: type "jordan@company.com", check the value, and check the accessible description is the helper text. | Set defaults; Do's & Don'ts: "Associate error/helper text via the field's accessible description" |
| `Anatomy` | Docs-only. The Figma example verbatim: label "Email address", required, value "jordan@company.com", helper "We'll send a confirmation to this address." | Documentation › Anatomy |
| `TypesAndStates` | Grid: Type rows × columns Default · Focus · Disabled · Error (plus Hover only if pseudo-states are approved) at Md. Inline rows have no helper text, as in Figma. | Documentation › Variants & States |
| `Sizes` | Sm · Md · Lg. | Size axis |
| `Error` | `error="Enter a valid email address."`, `required`. Play: the input has `aria-invalid="true"` and its accessible description contains the error. | State = Error; Content Guidance |
| `Disabled` | `disabled` with a value. Play: typing doesn't change the value. | State = Disabled |
| `FocusVisible` | Each of the four Types, one at a time. Play: Tab into each and assert `toHaveFocus()`. | Content Guidance (Borderless focus) |
| `Icons` | Leading icon · Trailing icon · both. | Show leading / trailing icon |
| `Clearable` | `clearable` with a value. Play: no clear button while empty; type text and the clear button appears; click "Clear", then the value is empty, focus returns to the input, and `onClear` is called once. | Clearable; Do's & Don'ts |
| `CharacterCount` | `showCount`, `maxLength={100}`. Play: typing updates the counter. | Show character count |

## 5. Docs page content (`TextInput.mdx`)

Figma has a single Documentation frame. Map its sections to the standard tabs (skill.md §5):

- **Subtitle:** use the ComponentSet description's first sentence: "Captures a single line … of user-entered text for form submission, search, or filtering." The Documentation header line mentions "multi-line" and "specialized variants", which aren't built, so don't use it.
- **Usage:**
  - Anatomy ①–③ (embed `Anatomy`).
  - Content Guidance: validate on blur; clear the error once the value becomes valid.
  - Do's and Don'ts: clear icon precedence, mobile keyboard type, accessible description.
- **Style:**
  - Variants & States (embed `TypesAndStates`) and its "60 variants" sentence. **Leave out** the clause about the missing Underlined, Warning, Read-only and Loading variants.
  - Token Map: `color/border/focus`, used for the Outlined / Md / Focus border.
- **Accessibility:** Figma has no Accessibility tab for Input. Use only the accessibility statements already in the doc: the visible focus ring on every Type, the accessible description for helper and error text, and the required indicator. Don't add a keyboard table that Figma doesn't have. Report the missing tab as a Figma doc issue.
- **Leave out** Flags; report them in chat.

## 6. Known issues to report each run (until Figma changes)

- **Figma doc Flags, relayed as-is:**
  - The skill lists an Underlined Type, but the build has Inline instead.
  - The skill lists 9 states, but only 5 are built.
  - Possible overlap with the `↳ Form` page's `InputControl` / `InputField`.
  - The specialized variants (textarea, search, password, OTP, numeric) aren't built.
- **Figma doc issues:**
  - There are no Usage / Style / Accessibility tabs, unlike Button and Alert.
  - The header line promises multi-line and specialized variants that don't exist.
  - Offer a 05-documentation-agent run to bring Input up to the three-tab standard.
- **Naming:** Figma "Input" vs code `TextInput`. If the user later wants the code renamed, that's a separate change, not part of this skill. The Figma page title also says "Input Field", while the set is named "Input".
- **Default size:** the Figma default variant is **Sm**. Set meta `args.size: 'sm'`.
- **Page description contradiction (found 2026-11-05):** the `page-description` text says Read-only, Warning, Success, Loading and Filled are "boolean overlays applied via component properties", but the set has no such properties. They stay out of scope until real properties exist.
- **Code gaps (found 2026-11-05, visual compare):**
  - **Inline:** Figma puts the label to the left of an outlined box; the code renders the label above an underlined field.
  - **Filled:** the code adds a bottom border that Figma's Filled doesn't have.
  - **Error:** the code adds a status icon before the helper text; Figma shows only the trailing ⊗ in the field.
- **Grid width:** the Types & states grid is wider than the docs canvas. Wrap it in a focusable `role="region"` with `overflowX: 'auto'` (the a11y gate requires the focusable wrapper). See `TextInput.stories.tsx`.
- **TextArea:** losing its only stories is expected; it isn't on the Figma page.
