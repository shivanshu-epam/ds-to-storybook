# Pilot: Carbon Button, story by story and control by control

We compared the Button that ds-sync generates from the Carbon v11 community Figma file with Carbon's own live React Storybook (react.carbondesignsystem.com, "Components/Button"). Their story list, controls and docs page were read from the published Storybook index and the Button source in the carbon-design-system/carbon repository, on 24 November 2026.

The question for the pilot: what can be generated from Figma alone, and what needs another source?

## 1. Stories

| Carbon story | Generated story | Status |
| --- | --- | --- |
| Default | Default | Match |
| Secondary | Secondary | Match (added in this pilot) |
| Tertiary | Tertiary | Match (added) |
| Ghost | Ghost | Match (added) |
| Danger | Danger primary | Match; Figma names the value "Danger primary" |
| Danger Tertiary | Danger tertiary | Match (added) |
| Danger Ghost | Danger ghost | Match (added) |
| Skeleton (separate `ButtonSkeleton` component) | Skeleton (`state="skeleton"`) | Match visually (added); a separate component in code, a variant in Figma |
| Icon Button | Type story, "Icon only" column | Partial: shown, but not as its own story with tooltip controls |
| Icon Button With Badge | none | Not in Figma: the Figma Button has no badge |
| Radius (test only) | none | Not in Figma: no radius properties in the v11 file |
| none | Style and state, Type, Size, Optional parts | Extra: every designed combination, on the docs page |
| none | Disabled | Extra (added): Carbon covers disabled through the control |
| none | Activates, Figma variants (test only) | Extra: interaction test, visual comparison with Figma |

All 8 stories that come from Figma now match. The other 4 depend on things the Figma file does not contain.

## 2. Controls

| Carbon control | Generated control | Status |
| --- | --- | --- |
| `kind` (7 values) | `styleVariant` (Figma "Style", 7 values) | Same values, different names (`danger` vs `danger-primary`, `danger--ghost` vs `danger-ghost`) |
| `size` (xs to 2xl, default lg) | `size` (extra-small to 2x-large, default large) | Same 6 sizes, Figma names; Figma also lists "Expressive" as a size |
| `isExpressive` | `size="expressive"` | Modelled differently: a boolean in code, a size in Figma |
| `disabled` | `disabled` | Match |
| `hasIconOnly` | `type="icon-only"` (Figma "Type") | Same meaning, different shape. Our prop name `type` also hides the native button `type` (submit, reset) |
| `renderIcon` (Add / None) | `icon` (boolean) + `swapIcon` (slot) | Same meaning, split in two |
| children ("Button") | `buttonText` | Same meaning |
| `iconDescription` | none; the label text names icon-only buttons | Behaviour covered, no prop |
| `href`, `target`, `rel`, `role`, `tabIndex`, `type` | none | Not in Figma (code only) |
| `dangerDescription`, `tooltipAlignment`, `tooltipPosition`, `tooltipDropShadow`, `tooltipHighContrast`, `autoAlign`, `isSelected`, `badgeCount` | none | Not in Figma (code only) |
| none | `resizer` | Extra: a Figma construction layer, not part of Carbon's API |
| `onClick` in the Actions panel | `onClick` in the Actions panel | Match (added) |

Every Carbon control that has an equivalent in Figma (kind, size, disabled, icon-only, icon and label) is present. The differences are names and shapes, which belong to the code API. Fourteen controls exist only in code.

## 3. Docs page

| Carbon section | Generated | Status |
| --- | --- | --- |
| Overview | Overview, Preview | Match (Figma description) |
| Danger Button, Icon-only Button, Skeleton state (usage guidance) | none | Missing: no usage prose in the Figma file |
| Radius | none | Not in Figma |
| Component API (prose per prop) | Properties tables | Partial: every prop listed with type and default, but no prose |
| References, Feedback | none | Organisation content |
| none | Variants, States, Behaviour and keyboard, Composition, Accessibility, Code, Design reference | Extra |

## 4. What changed in the generator (all components, not just Button)

- **One story per value of the main appearance property.** The property is found by name (Kind, Variant, Style, Type, Appearance, Emphasis, Intent, Color, Hierarchy, Status, Severity), as the reference specs say.
- **One story per state a prop sets:** Disabled, and non-pseudo state values such as Skeleton or Error.
- **Click events in the Actions panel** for every component that renders a native button.

Story tests, Carbon, default mode, on the same Figma export:

- **Before:** 588/656 pass.
- **After:** 982/1094 pass, including the 438 new stories. All Button stories pass in every mode.
- **The 44 new failures:**
  - 43 repeat accessibility findings already reported for the design: 39 colour contrast, mostly the low-contrast placeholder, label and min/max text in the Error and Warning variants, and 4 label-title-only.
  - 1 is new: the dropdown combobox's Skeleton variant has no label, so its trigger has no accessible name.
- **Design System AI:** passes 531/531.
- **Blade:** fails only on colour contrast, as before.

## 5. What Figma alone cannot give, and where it should come from

| Gap | Source (decision 2: code wins for API, Figma for visuals) |
| --- | --- |
| Prop names and shapes (`kind`, `hasIconOnly`, `renderIcon`, `isExpressive`, `ButtonSkeleton`) | Code mode: read the component's TypeScript types |
| Code-only props (link props, tooltip, badge, danger description) | Code mode |
| Usage guidance (danger, icon-only, skeleton) | Figma doc frames when present, otherwise AI prose reviewed in the PR |
| A Figma property named "Type" hides the native button `type` | Generator fix: rename it when the root element has a native `type` attribute |
| `resizer` shown as a public prop | A decision marking it internal, or a rule for construction layers |

## 6. Code mode (follow-up)

Code mode reads each component's API from the module the team imports it from. Here that is `@carbon/react` 1.121.0, installed into a local folder that is not committed. The TypeScript checker reads the props of every export: plain functions, `forwardRef` and polymorphic components all work. ds-sync then maps each Figma property to a prop. Code wins for names, values and shapes, and Figma still gives the visuals and tokens. It is turned on with `generate.code` in `ds-sync.config.json`:

```json
"code": { "from": "@carbon/react", "root": "code" }
```

The output is `CODE-MAP.md` (for review in the pull request) and `code-map.json`, next to the Storybook.

**Button, mapped:**

| Figma | Code | How |
| --- | --- | --- |
| Style | `kind` | 7/7 values; Danger primary → `danger--primary` |
| Type | `hasIconOnly` | "Icon only" → true, "Text + Icon" → false |
| Size | `size` | 2X large … Extra small → `2xl` … `xs`; Expressive → `isExpressive` |
| State | (no single prop) | Hover, focus and active come from CSS; Disabled → `disabled`; Skeleton → `<ButtonSkeleton>` |
| Icon, Swap icon | `renderIcon` | The icon slot |
| Button text | `children` | |
| Resizer | none | Figma construction layer |

Only in code: `badgeCount`, `dangerDescription`, `href`, `iconDescription`, `isSelected`, `rel`, `target` and the four tooltip props.

**Applied to the generated Storybook:** the controls and props are now `kind`, `hasIconOnly` and `size` with Carbon's values (`primary`, `lg`, …), as in Carbon's own Storybook. Children, slots, opposite toggles ("Show label" vs `hideLabel`) and state props are listed in CODE-MAP.md, and the generated component keeps Figma's shape for them for now.

**Across Carbon:**
- 58 of 218 components were found in `@carbon/react`. They are matched by name, by the same words in another order (NotificationInline → `InlineNotification`), or without a "Default" / "Base" suffix. Most of the rest are Figma building blocks with no export of their own, such as table cells, slider rails and skeleton parts.
- 194 of 356 Figma properties map to code props, and 46 of those are applied.
- Story tests are unchanged: no new failures, and one fewer.

**Not done yet:** stories that render the team's real component instead of the generated one, and documenting the code-only props. Both belong to the "enhance" mode for teams that already have code.

## 7. Real components (react-code target)

A third Storybook, `storybook-code`, renders Carbon's own components from `@carbon/react`, set up from Figma through the code map. Figma decides what is shown (every property, value and designed variant); code decides how it is set.

```json
"code": {
  "from": "@carbon/react", "root": "code",
  "styles": ["@carbon/styles/css/styles.css"], "icons": "@carbon/icons-react",
  "examples": { "PaginationNav": { "totalItems": 10 }, "Slider": { "labelText": "Slider label" } },
  "parents": { "ListItem": "UnorderedList" }
},
"targets": [{ "target": "react-code", "outDir": "storybook-code" }]
```

**For each component found in code:**
- **Stories:**
  - Default, using Figma's default variant and copy in code terms;
  - one story per value of the main appearance property;
  - one story per Figma property, showing each of its values;
  - optional parts;
  - a test-only story with every designed variant that code can express, ready for the visual check.
- **Controls:** every code prop. Each is marked with the Figma property it comes from, or "Code only".
- **Icon slots:** these get the Figma default icon from `@carbon/icons-react`.
- **Item components** render inside their parent (AccordionItem inside Accordion).
- **Docs page:**
  - overview and preview;
  - variants;
  - all properties;
  - the Figma-to-code table;
  - the props that exist only in code;
  - points for review;
  - accessibility;
  - the import line.
- **Matching:** one Figma component per export. NumberInputDefault is the `NumberInput`, and the building block NumberInputBase is not.

**Button:** Default, Secondary, Tertiary, Ghost, Danger primary, Danger tertiary and Danger ghost, plus Style, Type, Size (Expressive → `isExpressive`) and State (Disabled → `disabled`, Skeleton → `<ButtonSkeleton>`; Hover, Active and Focus are real interactions). The children are Figma's "Button", and the icon is `Add`.

**Carbon, 54 components:**

- **Story tests:** 136 of 149 pass.
- **The 13 failures:**
  - 10 are Carbon's own behaviour:
    - `aria-errormessage` with no way to announce it, in the four text and password inputs;
    - disabled and read-only text below contrast (4); WCAG exempts inactive controls, but axe cannot tell;
    - an empty header in the DataTable skeleton;
    - a scrollable region in the fluid Select;
    - a label only in a title, in TimePicker.
  - 2 are Tooltip, which needs a trigger element as its child.
  - 1 is TimePicker's label, which the Figma file does not have as a property.
- **Not in the test run:** DataTable and the two Dropdowns need example data (rows and headers, items) that Figma does not have. They are reported, and can be given through `examples`.
- **Docs coverage, "everything in Figma is in Storybook":**
  - Overall: 3 of 54 components are complete.
  - Properties: 210 of 353 Figma properties are in Storybook.
  - Variants: 330 of 1991 designed variants render, and 590 more are hover, focus or pressed states that you see by interacting with the real component.
  - The rest are real differences between the Figma file and the code. "Show toggletip" is a Figma construction toggle in 18 components. Open, Selected and Text filled are interaction states in code. Skeleton has no code component for 7 components. These are listed per component in DOCS-COVERAGE.md and CODE-MAP.md.

**Not done yet:**
- The visual comparison of real Carbon against Figma: it needs an export with variant renders.
- Web Components.

## 8. Usage guidance (write skill)

Carbon's Figma file has no documentation frames, so Button's evidence pack (`.ds-sync/usage/Button.json`) has:
- **Figma:** the description, and each property with its values.
- **ds-sync guidance:** general guidance for buttons and the accessibility contract, from the reference spec.
- **Code:** `@carbon/react`'s prop descriptions.
- **System:** Carbon's other button components.

**The draft.** It was written with the `write-usage` skill and recorded with `ds-sync usage --from`.
- When to use: 3 sentences.
- When not to use: 2 sentences.
- Variants: guidance for Primary, Secondary and Danger primary.
- Questions for the designers: Tertiary, Ghost and the other danger styles; `href` against Link; when to use Expressive.

**Checks.** Every sentence cites its sources, and the cited text is stored with the draft. One test sentence cited a source that does not exist, and the engine dropped it.

**Result.**
- The Usage section appears on Button's page in both Carbon Storybooks, marked as a draft.
- The gate reports the "usage" gap closed.
- Confidence is 0.45, because most sentences rest on general guidance rather than Carbon's own words. Carbon's team would raise it by adding usage frames in Figma.

## 9. Separate component (Phase 3)

A proposed decision for Carbon Button: `"State": { "components": { "Skeleton": "ButtonSkeleton" } }`.

**What changes in the generated Button:**
- `state` no longer offers "skeleton", so its control is hidden.
- `Button.tsx` exports `ButtonSkeleton(props: Omit<ButtonProps, 'state'>)`, which renders the skeleton design.
- The Skeleton story renders `<ButtonSkeleton>`.
- Components that place a skeleton button inside them, such as DataTableSkeletonBase, keep the exact design.

With this, all three Phase 3 items for the Carbon Button pilot are decisions: Resizer internal, sizes as code values (from code mode), and Skeleton as its own component. Button's and DataTableSkeletonBase's story tests pass (19/19).
