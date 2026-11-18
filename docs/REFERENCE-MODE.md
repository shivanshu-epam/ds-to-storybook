# Reverse engineering Blade: feasibility assessment

Date: 18 Nov 2026. Status: assessment only, nothing built. Read with [HYBRID.md](HYBRID.md), which already benchmarks Blade's Figma file against its Storybook and code. This document answers a new proposal: reverse engineer Blade from its **live implementation** as well as its Figma file, and make the generated Storybook match the live site.

Every number marked **verified** was measured today. The sources were:

- the Blade Figma file we use, "Blade Design System (Community) (Copy)", through our extracted IR;
- `razorpay/blade` on GitHub, `master` branch;
- the live Storybook at blade.razorpay.com, through its `/index.json` and computed styles in its story iframes.

Everything else is marked as an assumption.

## Decision (18 Nov 2026)

**Input is Figma only. Output is a production-ready Storybook with generated components.** That answers question 1 in section 7 and settles questions 2, 4 and 5: Figma always wins, the tool reads no source code, and it generates components rather than wrapping existing ones. As a result:

- **Reference mode (sections B to E) is not part of the product.** There will be no `probe` or `reconcile` command, and no live site or repository as input.
- **Blade's code and live site remain an answer key for development only.** We score the AI's API proposals against Blade's code, which it never sees, as we already do. We don't score visuals against the live site, because the Figma copy specifies a different button (see the table below). Visual accuracy is measured against Figma renders, which is what the tool can actually promise.
- **Question 3 still matters, but only for evaluation.** A current internal Blade Figma file would let the live site serve as a visual check as well.
- **What "production ready" now means** for a Figma-only Storybook is set out in [HYBRID.md](HYBRID.md) and the plan that follows this decision: generated components with code-quality APIs, behaviour, docs and foundations pages, visual parity with Figma, proof on a system it hasn't seen, and a published package and Action.

The rest of this document is kept as the record of why reference mode was considered and rejected.

## 0. The finding that changes the plan

The Figma file and the live site are not the same design. They are two versions of Blade that have drifted apart.

| Property (Primary button, default state) | Figma copy | Blade code (`master`) | Live site |
| --- | --- | --- | --- |
| Height, XSmall / Small / Medium / Large | 28 / 32 / 36 / 48 | 28 / 32 / 36 / 48 (`minHeight`) | 28 / 32 / **40** / 48 |
| Horizontal padding, XSmall / Small / Medium / Large | 8 / 12 / 20 / 20 | 8 / 8 / 12 / 16 (`spacing[3,3,4,5]`) | 8 / 8 / 12 / 16 |
| Corner radius | 4 at every size | 8, and 12 for Large | 8, and 12 for Large |
| Primary background | `#305EFF` | (theme file) | `#1364F1` |
| Label | Separate desktop and mobile text layers | One label, responsive type | Inter 500, 12 / 14 / 16 px |
| Badge, Positive, Subtle | `#00A251` at about 9% | (theme file) | `#008F47` at 9% |

All verified. Three consequences:

1. **Our generator already matches the Figma copy.** 443 of Button's 600 variants match it pixel for pixel. So "the Storybook looks different from blade.razorpay.com" is not a generator bug. The Figma file we were given specifies a different button.
2. **The live site doesn't match `master` either.** Medium is 40 px live and 36 px in the code. The deployed Storybook is probably built from a different release (npm latest is 12.131.0); that cause is not verified. "The live implementation" therefore has to mean a pinned version, not a URL.
3. **"Figma plus live site as one source of truth" is a false premise.** There are three sources. Deciding which one wins is a policy decision, not something extraction can work out.

The community copy most likely lags Razorpay's internal Figma, which is an assumption. If the internal file matches the live site, most of this drift disappears. That is why access to it is the first question in section F.

## A. Feasibility

**Viable, but as a different product from the one proposed.** Rebuilding Blade's components from its website is technically possible and strategically weak. Reading the website and code as a second and third source, and reconciling them with Figma, is both feasible and valuable.

Advantages of using a system that has live code (verified for Blade):

- **The real tokens are readable as data.** `packages/blade/src/tokens` has typed global scales (colour, spacing 0–11 = 0–56 px, size, border, typography, elevation, motion, breakpoints, opacity, blur) and themes (`bladeTheme`, `bladeNeutralTheme`, `createTheme` for brand overrides).
  - The Figma side can't give us this: the Variables REST API returned **403** for this file, which needs Figma Enterprise. Figma gives us only resolved values, `#305eff` with an opaque variable ID.
  - Blade's own mapping note says Figma token paths and code token paths are the same strings (for example `surface.background.gray.subtle`). With variable names, the token mapping would be one-to-one, not a guess.
- **The real API is readable.** There are 98 component folders, 66 `_decisions/decisions.md` files and 243 story files. Our `ds-sync analyze` already reads props, types, defaults and JSDoc with the TypeScript compiler.
- **The rendered result can be inspected precisely.** The Storybook has 1,367 entries, and any story renders alone at `iframe.html?id=…` with arguments set from the URL (`&args=size:large`). That is a ready-made reference renderer for visual comparison.

Disadvantages and challenges:

1. **If the code exists, regenerating it is the wrong output.** A Blade team would import `@razorpay/blade`, not generated look-alikes. Generated components that copy Blade's computed CSS are a second, unmaintained Blade. The useful outputs for a system with code are:
   - a drift report between Figma and code;
   - stories and docs for the real components;
   - generated code only where code is missing.
2. **Computed styles lose meaning.** The DOM gives `rgb(19, 100, 241)` and `8px`, not `interactive.background.primary.default` and `radius.small`. The site uses CSS-in-JS with generated class names and a minified bundle, so token intent has to come from source code or Figma variables, never from the website.
3. **Stories aren't variants.** Blade's stories are scenarios ("Pay Now", "Button as Link"). Figma's are variant grids (600 for Button). Comparing them needs a mapping from Figma axis values to code props (Figma `size=Large` to `size="large"`; Figma `state=Hover` is a CSS state, not a prop). That mapping is judgement work, which is AI plus review.
4. **It breaks our accuracy measurement.** Today the AI sees only Figma and is scored against Blade's code, which it never sees. That is the only honest accuracy number we have (37% prop-name match after AI descriptions). If the code becomes an input, we need another held-out answer key.
5. **Generality.** Many design systems have no public Storybook or source, and some have only a website built with them. Whatever we build must degrade cleanly to Figma-only, which is today's tool.

## B. Reverse engineering strategy

| Source | Access | What to extract | Programmatic or AI |
| --- | --- | --- | --- |
| Figma file | REST API (have); Variables API (Enterprise) or our Figma plugin export (have, in `plugin/`) | Components, axes, layers, layout, resolved values, variable IDs, text and effect styles, doc frames | Programmatic (exists) |
| Source repository | Git checkout pinned to a tag | Token files as data; component props, types, defaults, JSDoc; `_decisions` docs; story args | Programmatic: the TypeScript compiler for props. Tokens need either evaluating the TS modules or AI reading them. Decisions docs: AI summarises. |
| Published package | npm tarball at the same version | Built CSS or JS, version, exports list | Programmatic |
| Live Storybook | `/index.json`, `iframe.html?id=&args=` | Story list, argTypes, computed styles, screenshots per arg combination | Programmatic (Playwright, which our visual check already uses) |
| Live product website | Browser | Real usage and layouts only | AI; low value for component reconstruction. Recommend out of scope. |

Mapping method:

1. Join components by name, then by structure:
   - Figma set `Button` to code folder `Button`, with AI for renames like Figma `Collapsible` to code `Collapsible`, whose Figma file wraps a button.
2. Join properties:
   - Figma axis to code prop, value by value (`Large` to `large`).
   - Classify each Figma axis as prop, CSS state, responsive, or design-only. This is AI, with deterministic checks (is the prop in the code type? are the values an enum?).
3. Join values: for each mapped (component, prop values) pair, record three columns, Figma, code token and live computed, as in the table in section 0.
4. Record each mismatch as a decision, `source: figma | code | live` with a reason, and let a person accept it. This reuses `ds-sync.decisions.json`.

## C. Proposed architecture

Extend the existing tool. Don't build a new skill set. A **reference mode** was already planned in HYBRID.md section 4 ("when a team has existing code, that code as a second source"). This proposal makes it concrete:

```
Figma ──extract──▶ figma IR ─┐
Repo ───analyze──▶ code IR ──┼─▶ reconcile ─▶ drift report + proposed decisions ─▶ person accepts
Live SB ─probe───▶ render IR ┘                                                         │
                                                                                       ▼
                         generate (uses accepted source per value) ─▶ Storybook ─▶ visual: vs Figma AND vs live
```

- **New deterministic commands:**
  - `ds-sync probe <storybook-url>` reads the index, argTypes and computed styles of the root element per story and arg combination.
  - `ds-sync reconcile` joins the three IRs and writes `drift.json` and `drift.md`.
  - `analyze` gains token extraction.
- **New AI work, in the existing interpret skill:**
  - component and axis-to-prop mapping;
  - classifying axes;
  - proposing which source wins per drift row, with evidence.
  - Output is decisions only, never code, as today.
- **Output choice per project:**
  - `wrap`: stories and docs that import the real package. For systems with code, this is the default.
  - `generate`: today's output. For Figma-only systems, or components missing from code.
- **Visual check:** it gains a second reference, the live iframe screenshot with mapped args, beside the Figma render. It reports both scores separately and never averages them.

What stays generic: every step works on any design system that provides the inputs, and drops the steps whose inputs are missing. Nothing Blade-specific goes into code. Blade's choices live in Blade's decisions file.

## D. End-to-end workflow

1. `init`: Figma URL, plus optionally a repo URL and tag, and a Storybook URL.
2. `discover`, `extract`: already exist.
3. `analyze --tokens`, `probe`: new.
4. `reconcile`: drift report.
5. `review`, then `interpret`: AI proposes mappings and a source per drift row.
6. `decisions accept`: a person decides.
7. `generate`, in `wrap` or `generate` output.
8. `visual`: against Figma and against live.
9. The audit gates each measure separately. A failed visual row points to its drift row or to a generator bug, and the diagnose skill sorts it.
10. Repeat from step 5 for whatever is still open.

## E. Proof of concept

Five components, chosen to cover each kind of drift:

| Component | Why |
| --- | --- |
| Button | Size, padding, radius and colour drift (verified); 600 variants; icon slots |
| Badge | Colour-palette drift (verified); simple, so failures are easy to explain |
| Checkbox | States as props versus CSS, indeterminate naming, group behaviour |
| Accordion | Compound API (`Accordion` > `AccordionItem`) that Figma models as one set |
| Dropdown / Select | Combobox behaviour, overlays, the hardest one for visual comparison |

Acceptance criteria for the POC:

- **Drift report:** every token-bound property of the five components has three columns filled, or a stated reason why one is missing. We check it by hand against the code for Button and Badge.
- **Mapping:** at least 90% of Figma axes are mapped to a code prop or classified, measured against code we hold out. For this to be a real test, AI accuracy must be measured on a system whose code the AI did not read.
- **Visual, wrap output against live:** at least 95% of comparable states are a "match" (≤2% pixels, size ±1 px). This mostly tests the harness, because it's Blade's own code.
- **Visual, generate output with accepted "code wins" decisions, against live:** at least 80% "match" on Button and Badge. This is the real test of reproducing the implementation.
- **Cost:** under $5 of AI per run for the five.

## F. Risks and open questions

Risks (verified unless marked):

- Figma Variables need Enterprise (verified 403). Without them, matching tokens from Figma to code works by value only, and values drift (see `#305EFF` versus `#1364F1`). Our Figma plugin export removes this risk but needs a person to run it in Figma.
- The live site's version differs from `master` (verified on Medium height). Every comparison must pin one version.
- The live site uses Inter. The Figma copy uses TASA Orbiter for display text, which isn't installed, and that already costs 275 visual variants. Fonts need to be supplied per system.
- Legal (assumption, not checked): Blade is MIT licensed, so reading it is fine. Other systems' private code or terms of use may forbid scraping. Reference mode should read only sources the user owns or that are licensed for it.
- Overfitting: adding Blade's code makes it easier to hide Blade-specific rules in the generator. Mitigation: a second system with public code (for example GitHub Primer or Shopify Polaris; their Figma availability is not checked).

Open questions, in section 7 below.

## G. Roadmap

| Phase | Deliverable | Acceptance | Estimate |
| --- | --- | --- | --- |
| 0 | Answers to section 7; current Blade Figma if available; pinned Blade version | Decisions recorded here | Waiting on you |
| 1 | `analyze --tokens` and `probe`; three IRs for the five POC components | Drift table reproduces section 0 automatically | 4–5 days |
| 2 | `reconcile`, drift report, AI mapping and source proposals | 90% mapping on held-out code; drift report reviewed | 4–5 days |
| 3 | Visual against live; `wrap` output | Wrap at least 95% match; generate at least 80% on Button and Badge | 4–6 days |
| 4 | All Blade components | Audit gates per measure; numbers recorded in HYBRID.md | 1 week |
| 5 | Second system with code, no tuning | Same gates without code changes | 1 week |

That is about 4–5 weeks after phase 0. It overlaps the earlier production estimate, because npm publishing, versioning and the GitHub Action are still needed either way.

## 7. Questions that change the architecture

1. **Who is the user?** Teams that have only Figma and need code, or teams that already have code and need it documented and kept in sync with Figma? The first is today's tool; the second makes `wrap` the default and the live site the reference.
2. **When Figma and the live code disagree, which wins by default?** Code (Storybook shows what ships), Figma (Storybook shows the intended design and flags the code), or neither (every drift row needs a person)?
3. **Can you get the current internal Blade Figma file**, not the community copy? If it matches the live site, the drift in section 0 is about a stale file, not about the method.
4. **For Blade, should the output import the real `@razorpay/blade` components, or be newly generated components that match them?** Only the second needs visual reproduction of the implementation; the first gets it for free.
5. **May the tool read source code in general,** or only what a browser can see? Private repos, licences, and whether customers would give the tool repository access.
