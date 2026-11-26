# Documentation coverage

Every component the Figma file defines, checked against its generated stories and docs page (Component Doc Spec v1, one JSON per component in `docspec/`).

- Components: 44; every Figma item in Storybook: 43/44
- Figma properties in Storybook: 135/136
- Property values: 295 shown in a story, 14 reachable through a control or by interaction, 0 missing
- Designed variants rendered: 1461/1461
- Required docs sections present: 290/308

| Component | Kind | Properties | Values (shown / control / missing) | Variants | Sections | Complete |
| --- | --- | --- | --- | --- | --- | --- |
| Button | Button | 7/7 | 8 / 7 / 0 | 180/180 | 7/7 | yes |
| ViewportsButton | Button | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| ListItem | List | 7/7 | 16 / 0 / 0 | 108/108 | 7/7 | yes |
| ViewportsListItem | List | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| Checkbox | Checkbox | 11/12 | 22 / 7 / 0 | 116/116 | 7/7 | no |
| ViewportsCheckbox | Checkbox | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| Badge | Badge | 7/7 | 14 / 0 / 0 | 135/135 | 7/7 | yes |
| ViewportsBadge | Badge | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| BreadcrumbItem | Navigation | 4/4 | 7 / 0 / 0 | 8/8 | 7/7 | yes |
| Separator | Divider | 1/1 | 2 / 0 / 0 | 2/2 | 7/7 | yes |
| ViewportsBreadcrumb | Navigation | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| Accordion | Accordion | 3/3 | 10 / 0 / 0 | 30/30 | 7/7 | yes |
| ViewportsAccordion | Accordion | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| NavControl | Navigation | 2/2 | 6 / 0 / 0 | 8/8 | 7/7 | yes |
| PaginationDot | Navigation | 1/1 | 2 / 0 / 0 | 2/2 | 6/7 | yes |
| AutoplayToggle | Switch | 1/1 | 2 / 0 / 0 | 2/2 | 7/7 | yes |
| ViewportsCarousel | Component (generic) | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| AvatarIdentity | Avatar | 6/6 | 6 / 0 / 0 | 6/6 | 7/7 | yes |
| AvatarGlyph | Avatar | 4/4 | 11 / 0 / 0 | 21/21 | 7/7 | yes |
| ViewportsAvatar | Avatar | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| Alert | Notification | 3/3 | 11 / 0 / 0 | 40/40 | 7/7 | yes |
| ViewportsAlert | Notification | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| Dialog | Dialog | 10/10 | 12 / 0 / 0 | 30/30 | 7/7 | yes |
| ViewportsDialog | Dialog | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| RadioControl | Radio | 2/2 | 11 / 0 / 0 | 17/17 | 7/7 | yes |
| RadioField | Radio | 2/2 | 9 / 0 / 0 | 14/14 | 7/7 | yes |
| RadioGroup | Radio | 2/2 | 6 / 0 / 0 | 8/8 | 7/7 | yes |
| ViewportsRadio | Radio | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| ViewportsDropdown | Select | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| DropdownTrigger | Select | 4/4 | 11 / 0 / 0 | 21/21 | 7/7 | yes |
| DropdownMenu | Menu | 3/3 | 3 / 0 / 0 | 3/3 | 7/7 | yes |
| Dropdown | Menu | 2/2 | 5 / 0 / 0 | 6/6 | 7/7 | yes |
| ViewportsForm | Component (generic) | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| InputControl | Text input | 1/1 | 9 / 0 / 0 | 9/9 | 7/7 | yes |
| InputField | Text input | 8/8 | 6 / 0 / 0 | 6/6 | 7/7 | yes |
| Form | Component (generic) | 1/1 | 5 / 0 / 0 | 5/5 | 7/7 | yes |
| Divider | Divider | 5/5 | 21 / 0 / 0 | 540/540 | 7/7 | yes |
| ViewportsDivider | Divider | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| DatePicker | Select | 3/3 | 10 / 0 / 0 | 21/21 | 7/7 | yes |
| ViewportsDatePicker | Select | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| Switch | Switch | 4/4 | 7 / 0 / 0 | 12/12 | 7/7 | yes |
| ViewportsSwitch | Switch | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| Input | Text input | 14/14 | 12 / 0 / 0 | 60/60 | 7/7 | yes |
| ViewportsInput | Text input | 1/1 | 3 / 0 / 0 | 3/3 | 6/7 | yes |

## Gaps

### Button

- No description in Figma or in decisions: the overview has no prose.

### ViewportsButton

- The docs page has no "usage" section (required for button components).
- No description in Figma or in decisions: the overview has no prose.

### ListItem

- No description in Figma or in decisions: the overview has no prose.

### ViewportsListItem

- The docs page has no "usage" section (required for list components).
- No description in Figma or in decisions: the overview has no prose.

### Checkbox

- Figma property "Has label" (boolean) has no prop, control or story.
- No description in Figma or in decisions: the overview has no prose.

### ViewportsCheckbox

- The docs page has no "usage" section (required for checkbox components).
- No description in Figma or in decisions: the overview has no prose.

### Badge

- No description in Figma or in decisions: the overview has no prose.

### ViewportsBadge

- The docs page has no "usage" section (required for badge components).
- No description in Figma or in decisions: the overview has no prose.

### BreadcrumbItem

- No description in Figma or in decisions: the overview has no prose.

### Separator

- No description in Figma or in decisions: the overview has no prose.

### ViewportsBreadcrumb

- The docs page has no "usage" section (required for navigation components).
- No description in Figma or in decisions: the overview has no prose.

### Accordion

- No description in Figma or in decisions: the overview has no prose.

### ViewportsAccordion

- The docs page has no "usage" section (required for accordion components).
- No description in Figma or in decisions: the overview has no prose.

### NavControl

- No description in Figma or in decisions: the overview has no prose.

### PaginationDot

- The docs page has no "api" section (required for navigation components).
- No description in Figma or in decisions: the overview has no prose.

### AutoplayToggle

- No description in Figma or in decisions: the overview has no prose.

### ViewportsCarousel

- The docs page has no "usage" section (required for component components).
- No description in Figma or in decisions: the overview has no prose.

### AvatarIdentity

- No description in Figma or in decisions: the overview has no prose.

### AvatarGlyph

- No description in Figma or in decisions: the overview has no prose.

### ViewportsAvatar

- The docs page has no "usage" section (required for avatar components).
- No description in Figma or in decisions: the overview has no prose.

### Alert

- No description in Figma or in decisions: the overview has no prose.

### ViewportsAlert

- The docs page has no "usage" section (required for notification components).
- No description in Figma or in decisions: the overview has no prose.

### Dialog

- No description in Figma or in decisions: the overview has no prose.

### ViewportsDialog

- The docs page has no "usage" section (required for dialog components).
- No description in Figma or in decisions: the overview has no prose.

### RadioControl

- No description in Figma or in decisions: the overview has no prose.

### RadioField

- No description in Figma or in decisions: the overview has no prose.

### RadioGroup

- No description in Figma or in decisions: the overview has no prose.

### ViewportsRadio

- The docs page has no "usage" section (required for radio components).
- No description in Figma or in decisions: the overview has no prose.

### ViewportsDropdown

- The docs page has no "usage" section (required for select components).
- No description in Figma or in decisions: the overview has no prose.

### DropdownTrigger

- No description in Figma or in decisions: the overview has no prose.

### DropdownMenu

- No description in Figma or in decisions: the overview has no prose.

### Dropdown

- No description in Figma or in decisions: the overview has no prose.

### ViewportsForm

- The docs page has no "usage" section (required for component components).
- No description in Figma or in decisions: the overview has no prose.

### InputControl

- No description in Figma or in decisions: the overview has no prose.

### InputField

- No description in Figma or in decisions: the overview has no prose.

### Form

- No description in Figma or in decisions: the overview has no prose.

### Divider

- No description in Figma or in decisions: the overview has no prose.

### ViewportsDivider

- The docs page has no "usage" section (required for divider components).
- No description in Figma or in decisions: the overview has no prose.

### DatePicker

- No description in Figma or in decisions: the overview has no prose.

### ViewportsDatePicker

- The docs page has no "usage" section (required for select components).
- No description in Figma or in decisions: the overview has no prose.

### Switch

- No description in Figma or in decisions: the overview has no prose.

### ViewportsSwitch

- The docs page has no "usage" section (required for switch components).
- No description in Figma or in decisions: the overview has no prose.

### Input

- No description in Figma or in decisions: the overview has no prose.

### ViewportsInput

- The docs page has no "usage" section (required for text input components).
- No description in Figma or in decisions: the overview has no prose.

