---
name: review-decisions
description: Walk a person through proposed entries in ds-sync.decisions.json (code names and descriptions that Claude proposed from Figma), so they accept, edit or reject each one. Use when the user wants to review, accept or approve ds-sync decisions or proposals, or after ds-sync interpret has run.
allowed-tools: Read Bash(npx ds-sync decisions *) Bash(ds-sync decisions *) Bash(node * decisions *)
---

# Review proposed decisions

Proposals change the generated API: a renamed prop is a breaking change for anyone already using the component. A person decides; you make the decision easy and safe.

1. Run `ds-sync decisions validate` and stop on errors: fix the file first.
2. Read `ds-sync.decisions.json` and list the sets with `"status": "proposed"`. Start with the lowest confidence and the ones with `questions`.
3. Show a few sets at a time, as a table: Figma property → proposed name → description → confidence → evidence in a few words. Put each set's questions under its table.
4. For each set the user decides on:
   - **Accept as is**: `ds-sync decisions accept --only "<Figma set>" --by "<their name>"`.
   - **Edit**: change the entry in the file as they say, then accept it.
   - **Reject**: `ds-sync decisions reject --only "<Figma set>" --by "<their name>"`. Rejected entries are kept, so the next interpret run does not propose them again.
   Never accept on your own judgement, and never use `--only all` unless the user asked for exactly that.
5. When they are done, regenerate (`ds-sync generate`) and point out what changed for consumers: renamed props are breaking for existing code.

`--decisions proposed` on `generate` previews proposals without accepting them; the generation report says so.
