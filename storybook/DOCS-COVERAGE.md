# Documentation coverage

Every component the Figma file defines, checked against its generated stories and docs page (Component Doc Spec v1, one JSON per component in `docspec/`).

- Components: 27; every Figma item in Storybook: 26/27
- Figma properties in Storybook: 117/118
- Property values: 241 shown in a story, 14 reachable through a control or by interaction, 0 missing
- Designed variants rendered: 1390/1390
- Required docs sections present: 162/189

| Component | Kind | Properties | Values (shown / control / missing) | Variants | Sections | Complete |
| --- | --- | --- | --- | --- | --- | --- |
| Button | Button | 7/7 | 8 / 7 / 0 | 180/180 | 7/7 | yes |
| ListItem | List | 7/7 | 16 / 0 / 0 | 108/108 | 6/7 | yes |
| Checkbox | Checkbox | 11/12 | 22 / 7 / 0 | 116/116 | 6/7 | no |
| Badge | Badge | 7/7 | 14 / 0 / 0 | 135/135 | 6/7 | yes |
| BreadcrumbItem | Navigation | 4/4 | 7 / 0 / 0 | 8/8 | 6/7 | yes |
| Separator | Divider | 1/1 | 2 / 0 / 0 | 2/2 | 6/7 | yes |
| Accordion | Accordion | 2/2 | 7 / 0 / 0 | 10/10 | 6/7 | yes |
| NavControl | Navigation | 2/2 | 6 / 0 / 0 | 8/8 | 6/7 | yes |
| PaginationDot | Navigation | 1/1 | 2 / 0 / 0 | 2/2 | 5/7 | yes |
| AutoplayToggle | Switch | 1/1 | 2 / 0 / 0 | 2/2 | 6/7 | yes |
| AvatarIdentity | Avatar | 6/6 | 6 / 0 / 0 | 6/6 | 6/7 | yes |
| AvatarGlyph | Avatar | 4/4 | 11 / 0 / 0 | 21/21 | 6/7 | yes |
| Alert | Notification | 3/3 | 11 / 0 / 0 | 40/40 | 6/7 | yes |
| Dialog | Dialog | 10/10 | 12 / 0 / 0 | 30/30 | 6/7 | yes |
| RadioControl | Radio | 2/2 | 11 / 0 / 0 | 17/17 | 6/7 | yes |
| RadioField | Radio | 2/2 | 9 / 0 / 0 | 14/14 | 6/7 | yes |
| RadioGroup | Radio | 2/2 | 6 / 0 / 0 | 8/8 | 6/7 | yes |
| Divider | Divider | 5/5 | 21 / 0 / 0 | 540/540 | 6/7 | yes |
| DatePicker | Select | 3/3 | 10 / 0 / 0 | 21/21 | 6/7 | yes |
| Switch | Switch | 4/4 | 7 / 0 / 0 | 12/12 | 6/7 | yes |
| Input | Text input | 14/14 | 12 / 0 / 0 | 60/60 | 6/7 | yes |
| DropdownTrigger | Select | 4/4 | 11 / 0 / 0 | 21/21 | 6/7 | yes |
| DropdownMenu | Menu | 3/3 | 3 / 0 / 0 | 3/3 | 6/7 | yes |
| Dropdown | Menu | 2/2 | 5 / 0 / 0 | 6/6 | 6/7 | yes |
| InputControl | Text input | 1/1 | 9 / 0 / 0 | 9/9 | 6/7 | yes |
| InputField | Text input | 8/8 | 6 / 0 / 0 | 6/6 | 6/7 | yes |
| Form | Component (generic) | 1/1 | 5 / 0 / 0 | 5/5 | 6/7 | yes |

## Gaps

### Button

- No description in Figma or in decisions: the overview has no prose.

### ListItem

- The docs page has no "usage" section (required for list components).
- No description in Figma or in decisions: the overview has no prose.

### Checkbox

- Figma property "Has label" (boolean) has no prop, control or story.
- The docs page has no "usage" section (required for checkbox components).
- No description in Figma or in decisions: the overview has no prose.

### Badge

- The docs page has no "usage" section (required for badge components).
- No description in Figma or in decisions: the overview has no prose.

### BreadcrumbItem

- The docs page has no "usage" section (required for navigation components).
- No description in Figma or in decisions: the overview has no prose.

### Separator

- The docs page has no "usage" section (required for divider components).
- No description in Figma or in decisions: the overview has no prose.

### Accordion

- The docs page has no "usage" section (required for accordion components).
- No description in Figma or in decisions: the overview has no prose.

### NavControl

- The docs page has no "usage" section (required for navigation components).
- No description in Figma or in decisions: the overview has no prose.

### PaginationDot

- The docs page has no "usage" section (required for navigation components).
- The docs page has no "api" section (required for navigation components).
- No description in Figma or in decisions: the overview has no prose.

### AutoplayToggle

- The docs page has no "usage" section (required for switch components).
- No description in Figma or in decisions: the overview has no prose.

### AvatarIdentity

- The docs page has no "usage" section (required for avatar components).
- No description in Figma or in decisions: the overview has no prose.

### AvatarGlyph

- The docs page has no "usage" section (required for avatar components).
- No description in Figma or in decisions: the overview has no prose.

### Alert

- The docs page has no "usage" section (required for notification components).
- No description in Figma or in decisions: the overview has no prose.

### Dialog

- The docs page has no "usage" section (required for dialog components).
- No description in Figma or in decisions: the overview has no prose.

### RadioControl

- The docs page has no "usage" section (required for radio components).
- No description in Figma or in decisions: the overview has no prose.

### RadioField

- The docs page has no "usage" section (required for radio components).
- No description in Figma or in decisions: the overview has no prose.

### RadioGroup

- The docs page has no "usage" section (required for radio components).
- No description in Figma or in decisions: the overview has no prose.

### Divider

- The docs page has no "usage" section (required for divider components).
- No description in Figma or in decisions: the overview has no prose.

### DatePicker

- The docs page has no "usage" section (required for select components).
- No description in Figma or in decisions: the overview has no prose.

### Switch

- The docs page has no "usage" section (required for switch components).
- No description in Figma or in decisions: the overview has no prose.

### Input

- The docs page has no "usage" section (required for text input components).
- No description in Figma or in decisions: the overview has no prose.

### DropdownTrigger

- The docs page has no "usage" section (required for select components).
- No description in Figma or in decisions: the overview has no prose.

### DropdownMenu

- The docs page has no "usage" section (required for menu components).
- No description in Figma or in decisions: the overview has no prose.

### Dropdown

- The docs page has no "usage" section (required for menu components).
- No description in Figma or in decisions: the overview has no prose.

### InputControl

- The docs page has no "usage" section (required for text input components).
- No description in Figma or in decisions: the overview has no prose.

### InputField

- The docs page has no "usage" section (required for text input components).
- No description in Figma or in decisions: the overview has no prose.

### Form

- The docs page has no "usage" section (required for component components).
- No description in Figma or in decisions: the overview has no prose.

