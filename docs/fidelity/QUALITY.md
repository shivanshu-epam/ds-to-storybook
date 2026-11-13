# Quality and validation framework

How fidelity is measured, so "accurate" is a number with evidence behind it, never a claim. Each measure says what is automated, what it proves, what it cannot prove, and what a person checks instead.

## 1. Measures

| # | Measure | Automated check | Pass rule (proposed) | What automation cannot prove | Manual review |
| --- | --- | --- | --- | --- | --- |
| 1 | **Visual fidelity** | `ds-sync visual`: every designed variant, Figma's render vs Storybook, pixel diff | Per component: ≥ 95% of variants "match" (≤ 2%, same size ±1px); none "differs" (> 10%) without an accepted reason | Whether a 1–2% text-edge difference matters; animation; real data | Designer reviews the worst five variants per component from the report |
| 2 | **Variant completeness** | Every Figma variant appears in the Figma Variants story; designed vs computed combinations counted | 100% of designed variants rendered; computed combinations labelled | Whether undrawn combinations are valid (category F) | Owner answers listed unknowns |
| 3 | **Property accuracy** | Every Figma property (incl. exposed nested and instance-swap) maps to a prop, or is listed as unsupported; every prop traces to Figma, a decision or a behaviour contract | 0 untraced props; 0 unmapped Figma properties without a backlog entry | Whether a prop's name reads well to developers | Engineer reviews the properties table |
| 4 | **Nested consistency** | For each nested layer and parent variant: props rendered by the generated parent equal Figma's instance properties | 100% equal, or listed as category C with reason | Intent where Figma uses sample content ("1." on every item) | Owner answers |
| 5 | **Interaction accuracy** | Play functions from the behaviour contract: keyboard map, focus, states, events | All contract steps pass | Behaviour Figma never specifies (it is reported as missing, not tested) | Engineer confirms contract choice per component |
| 6 | **Design-token compliance** | `token-map.json`: share of values bound to tokens; raw values listed | ≥ 95% of colours and spacing bound where variables exist; every raw value listed | Whether a raw value should be a token | Designer reviews raw values |
| 7 | **Accessibility** | axe in every Figma mode; contrast per mode; accessible name present | 0 failures, except accepted known issues with owner and reason | Screen-reader experience, reading order in context | Accessibility review per tier-2/3 component with a screen reader |
| 8 | **Documentation completeness** | Docs page lint: required sections for the tier present; no raw property names in headings; no stray stories; every example compiles (typecheck) | 100% | Clarity and tone | New-developer test (section 2) |
| 9 | **Developer usability** | Code examples typechecked; props have descriptions; Playground controls work | 100% | Whether a developer can actually use it | New-developer test (section 2) |
| 10 | **Regression prevention** | CI on every Figma update: story tests in every mode, visual check on changed components, API diff (props added/removed/renamed) in the PR | Any drop in measures 1–9 fails the PR check, or needs an explicit acceptance | Intentional design changes (they appear as diffs to approve) | Reviewer approves the PR with the change summary |

## 2. New-developer test

For each tier-2 and tier-3 component, someone who has not used it, with only the Storybook page:

1. explains in one sentence what it is for (Overview);
2. renders it with a non-default configuration in an app (Code);
3. handles its main interaction (Behaviour);
4. finds what to do about accessibility (Accessibility).

Pass: all four in under five minutes, without asking. Failures become documentation issues.

## 3. Component scorecard

Every component gets a scorecard in `GENERATION-REPORT.md`, its docs page, and the PR description:

```
Accordion                     tier 3 · Figma 72525:7005 · version 2421258213307436575
Visual fidelity      3/3 designed variants match            ✓
Variants             3 designed, 0 computed shown           ✓
Properties           4/4 Figma properties mapped            ✓
Nested consistency   3 nested layers × 3 variants match     ✓
Interaction          disclosure contract: 7/7 steps pass    ✓
Tokens               raw values: 12 (no variables export)   ⚠ needs plugin export
Accessibility        0 failures in 1 mode                   ✓
Documentation        tier-3 sections complete               ✓
Open decisions       1: do Number leadings count up?        ⚠
```

A library dashboard aggregates scorecards (match rates, open decisions, unsupported features), so fidelity is tracked over time.

## 4. What we will not claim

- "100% accurate" without measures 1–5 at 100% and the manual reviews done.
- Accuracy for components whose behaviour Figma does not specify.
- Accuracy across fonts that are not installed (reported per component until the font is loaded).
