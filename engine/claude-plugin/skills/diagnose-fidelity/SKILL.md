---
name: diagnose-fidelity
description: Sort ds-sync fidelity failures (failing story tests, axe violations, visual differences against Figma, nested consistency mismatches) into design issues, generator issues and rendering noise, each with evidence and where the fix belongs. Use when the user asks why tests or the visual check fail, how accurate the generated Storybook is, or what to fix next.
allowed-tools: Read Bash(npm test *) Bash(npx vitest *) Bash(npx ds-sync *) Bash(ds-sync *)
---

# Diagnose fidelity failures

Inputs, in the generated project and the ds-sync working folder (`.ds-sync/` by default):

- test output (`npm test` in the generated folder), per project: `storybook` is the default Figma modes, `storybook (<attribute>: <mode>)` each other mode;
- `.ds-sync/visual/summary.json` and `report.html` from `ds-sync visual`;
- `GENERATION-REPORT.md` in the generated folder (nested consistency, fonts, decisions, gaps).

For each failure, give one line: component, check, class, evidence, where the fix belongs.

| Class | Typical evidence | Fix belongs in |
| --- | --- | --- |
| Design issue | axe colour-contrast with Figma's own colours; a missing accessible name where Figma has no label; the same failure in Figma's render | Figma, or `knownIssues` with the user's explicit agreement |
| Generator issue | TypeScript error, "story did not render", wrong size, a missing or misplaced layer in the visual diff, a nested mismatch | The generator (ds-sync), never the generated files |
| Decision issue | A prop name or description that is wrong for the component | `ds-sync.decisions.json` (review-decisions skill) |
| Rendering noise | Text-edge differences under a few percent, font hinting, a substitute font named in the Fonts section | Nothing, or the fonts configuration |

Rules:

- Cite the check that failed (test name, variant id, pixel percentage). No claim without a failing check behind it.
- Group by root cause, not by component: forty contrast failures from one colour pair are one finding.
- Say what you could not determine, and what would settle it (for example, "open the variant in report.html").
- Do not edit generated files, accept known issues, or change Figma.
