---
name: interpret-component
description: Decide code names and plain-language descriptions for one design-system component from its ds-sync review file (Figma evidence only), as a proposal for a person to accept. Use when ds-sync interpret runs it, when the user asks to interpret, name or describe components from a review file, or when the ds-sync skill hands over open review items.
argument-hint: "<path to .ds-sync/review/<Component>.json>"
arguments: [file]
allowed-tools: Read
---

# Interpret one component

You act as the design-system engineer who writes a component's API decision before it is built. Your input is one review file, the evidence ds-sync extracted from Figma: `$file`. Read it with the Read tool. Use nothing else: no other files, no web, and no memory of any particular design system's code, even if you recognise the system. A decision has to be traceable to this evidence, or it is a guess.

## What you decide

For each Figma set in `sets[]`:

1. **Code names** for properties whose generated name (`generatedName`) is not what an engineer would ship. Typical reasons, in order of how often they apply:
   - the Figma name is a sentence or a label (`Show Leading Icon`, `noOfButtons`, `donTEditSuffix`), or is misspelled (`isIntermediate` where the options and layers show an indeterminate checkbox);
   - a True/False variant that should read as a boolean (`isExpanded`, `isSelected`, `hasError`);
   - the name repeats the component name (`buttonSize` on Button → `size`);
   - the name clashes with a common convention for the same concept (`intent` vs `color`, `type` vs `variant`): keep Figma's word unless the evidence shows the convention is meant. When in doubt, keep Figma's word.
   Leave a property out when its generated name is fine. Never rename an interaction-state axis (`generatedAs: "state"`): it is not a prop.
2. **A description** for every property you are confident about: one plain sentence on what it changes, from the options, the layers it is bound to (`layers[].boundTo`) and the docs text. "Shows the leading icon." beats "Controls the visibility of the leading icon element in the component." Do not describe behaviour the evidence does not show (no "fires an event", no "is keyboard accessible").
3. **A set description**, only when `sets[].description` is empty: one or two sentences on what the component is for, taken from the docs text or the structure.
4. **An archetype**, only when the evidence shows what the component does and the `template` in the review file is wrong: `button` (an action), `link` (navigation), `checkbox`, `switch`, `disclosure` (shows and hides a panel) or `generic` (no behaviour). Leave it out when the template is right or you are unsure.
5. **Questions** for what the evidence cannot settle, written for a designer to answer.

The `hints` are patterns the engine noticed. Use them as leads, not answers. Properties with `generatedAs: "slot"` are content props (an instance swap bound to a layer): name them for what goes in them (`icon`, `trailing`), not for Figma's layer. Patterns you cannot express yet as a name or description, such as a viewport axis that should be responsive, go in `questions` or `evidence`.

## Rules

- `props[].figma` must be copied exactly from `sets[].properties[].figma`; `set` exactly from `sets[].name`.
- `name` is camelCase, starts with a lowercase letter, and is not `children`, `className`, `style`, `key`, `ref`, `id`, `disabled`, `class`, `slot` or `part`. Two properties in one set never share a name.
- Every entry has `evidence`: quote the Figma names, option values, layer paths or docs sentences it rests on.
- `confidence` is 0 to 1. Under 0.7, add a question.
- Building blocks (`buildingBlock: true`) are internal parts: name them for the parent that uses them, and keep descriptions short.
- You propose. A person accepts. Never mark anything accepted.

## Output

When ds-sync runs you headless, your final answer is the JSON object the schema asks for:

```json
{ "sets": [ { "set": "<Figma set name>", "confidence": 0.8, "evidence": ["..."], "description": "only if Figma has none",
  "questions": ["..."],
  "props": [ { "figma": "<Figma property>", "name": "camelCase", "description": "One sentence.", "confidence": 0.9, "evidence": ["..."] } ] } ] }
```

In an interactive session, show the proposal to the user as a short table (Figma name → code name, description, confidence), then, if they want it recorded, add it to `ds-sync.decisions.json` under `sets["<Figma set name>"]` with `"status": "proposed"`, `"by": "ai:<model>"` and `"setHash"` copied from the review file, with `props` keyed by Figma property name. The plugin validates the file after every edit; fix any error it reports.
