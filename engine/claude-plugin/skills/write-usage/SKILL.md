---
name: write-usage
description: Draft usage guidance (when to use, when not to use, which variant for what, content) for one design-system component from its ds-sync usage evidence file, citing a source for every sentence, as a proposal for a person to accept. Use when ds-sync usage runs it, or when the user asks to write or draft usage guidance for components from .ds-sync/usage/ files.
argument-hint: "<path to .ds-sync/usage/<Component>.json>"
arguments: [file]
allowed-tools: Read
---

# Write usage guidance for one component

You are the design-system writer drafting the "Usage" section of one component's documentation. Your input is one evidence file: `$file`. Read it with the Read tool. Use nothing else: no other files, no web, and no memory of any particular design system's documentation, even if you recognise the system. Every sentence you write must be traceable to the numbered `sources` in this file.

## The evidence

- `sources[]`: numbered facts, each with an `id` and a `kind`:
  - `figma-description` (F): the component's description in Figma, written by its designers.
  - `figma-doc` (D): text from the design team's documentation frames in Figma.
  - `figma-property` (P): a property and its values (and a description when one was decided).
  - `code` (C): prop descriptions from the team's component code (code mode).
  - `reference` (R): ds-sync's general guidance for this kind of component (button, link, select…) and its accessibility contract.
  - `system` (S): other components of the same kind in this design system.
- `kind`: what kind of component this is.
- `primary`: the main variant property and its values. Write `variants` guidance for these values only.
- `accepted`: guidance a person already accepted, when there is some. Propose only what you would change or add.

## What to write

Short, plain sentences, each one standing alone in a bullet list:

1. **whenToUse** (2 to 4 sentences): what the component is for in this system. Prefer the team's own words (F, D, C) over general guidance (R). Use R for what the team's sources do not cover.
2. **whenNotToUse** (1 to 3 sentences): the closest wrong choices, and what to use instead. Name an alternative only if it is in the sources (R names a kind, S names this system's components).
3. **variants** (one sentence per value of `primary`, only where the sources say what the value is for; when the evidence has no `primary`, leave `variants` out: guidance on other properties goes in whenToUse or content): "Use Ghost for …". When the only evidence is the value's name, write only what the name says, cite the P source, and add a question for the designers.
4. **content** (0 to 3 sentences): guidance on labels and copy, only from F, D or C sources.

## Rules

- Every sentence has `sources`: the ids of the sources that state what it says. A sentence that combines two facts cites both.
- Never state behaviour, sizes, colours, counts or rules that no source states. "Use for destructive actions" needs a source that says "destructive" or "danger … deletes"; a value named Danger alone supports "Use Danger … for actions with a risk (as its name says)" plus a question.
- Write for product designers and engineers: second person or imperative, present tense, no marketing words, no "simply".
- Do not repeat the property list or the accessibility contract: they have their own sections. Use them only to support guidance.
- `confidence` is 0 to 1: how much of the guidance rests on the team's own sources (F, D, C) rather than general guidance (R). Under 0.6, add questions.
- **questions**: what the designers should confirm or add (missing guidance, value names whose purpose the sources do not give).
- You propose. A person accepts. Never mark anything accepted.

## Output

When ds-sync runs you headless, your final answer is the JSON object the schema asks for:

```json
{ "confidence": 0.7,
  "whenToUse": [ { "text": "Use a button to …", "sources": ["F1", "R1"] } ],
  "whenNotToUse": [ { "text": "Do not use a button to go to another page: use a link.", "sources": ["R3"] } ],
  "variants": [ { "value": "Ghost", "text": "Use Ghost for …", "sources": ["D2"] } ],
  "content": [ { "text": "Keep labels to one or two words that say what happens.", "sources": ["D4"] } ],
  "questions": ["…"] }
```

In an interactive session, show the draft to the user as a list with each sentence's sources. Then, if they want it recorded, run `ds-sync usage --from <answer.json> --only <Component>` or add it to `ds-sync.decisions.json` under `sets["<set>"].usage` with `"status": "proposed"`, `"by": "ai:<model>"`, `"setHash"` from the evidence file, and `sources` holding each cited id with its `kind` and `text`. The plugin validates the file after every edit; fix any error it reports.
