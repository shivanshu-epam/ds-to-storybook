# Production-ready documentation: the standard

This is what ds-sync checks for every component in a Figma file, not only buttons. The checks are machine-readable: `ds-sync generate` writes one Component Doc Spec per component (`docspec/<Component>.json`, schema in `schemas/component-doc-spec.schema.json`) and a summary (`DOCS-COVERAGE.md`) next to the generated Storybook.

The goal, as agreed: the docs are complete, and whatever is in Figma is in Storybook, 100% accurate.

## 1. Everything in Figma is in Storybook (gate: must pass)

| Figma item | Counts as covered when |
| --- | --- |
| Variant property | It has a prop and a control, and every value is either shown in a visible story or can be picked in the control. The default value counts as shown by the Default story. |
| Boolean property | It has a prop or slot, and an "Optional parts" story shows it switched, or it can be set from a control. |
| Text property | It has a prop and a text control. The Default story shows the Figma copy. |
| Instance swap | It has a slot prop, documented in the controls table. |
| Designed variant | It renders in the test-only "Figma variants" story, which the visual check compares with Figma's own render. |

A component is **complete** when all of these hold. Anything else is listed as a gap, naming the Figma item.

## 2. The docs page has the sections its kind needs (gate: required sections)

Each component gets a kind from a reference spec (`references/<kind>.yaml`). The kind comes first from the behaviour found in the Figma structure (tabs, menu, dialog and so on), then from the component's name, and otherwise from the generic `component` reference. The reference sets:

- the required and optional docs sections: overview, preview, variants, accessibility, usage, properties (API) and code for every kind, plus kind-specific ones such as sizes and icons for buttons;
- the stories to write: Default, one for each value of the main variant property, one for each other property, optional parts, prop states, and every Figma variant in a test-only story;
- the accessibility contract: WAI-ARIA pattern, role, how it is named, and keyboard;
- related components to link.

Reference specs set the structure only. Names, options and copy always come from the design system's own Figma file.

## 3. Prose has a source (gate: review)

The description and usage guidance come from Figma (the component description or doc frames) or from reviewed decisions (`ds-sync.decisions.json`). When neither exists, the spec records the gap ("the overview has no prose") rather than inventing text. Prose written by AI is allowed, but it goes into decisions and is reviewed in the pull request like any other change.

## 4. What is not yet checked

- Accuracy against code (props and behaviour from an existing codebase). For now code mode is planned, and Figma is the only source.
- Web Components stories. The check runs on the React target; Web Components follow the same plan but are not parsed yet.
- Usage guidance. No system we tested has it in Figma, so every component reports this section as missing until it is written.
