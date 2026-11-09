# GAPS, spec #518 (treeView)

Unmet criteria and choices not covered by the spec or its D-ids, per ticket. "For the maintainer" items go into the PR body.

## T1 (#571)

- D486 corpus comparison: the 15 `e2e/diagrams/tree-view/*.mmd` are byte-identical to 12.2.0's own e2e files; 8 were flattened upstream in v12 commit `7a38a04a6` against the cypress originals (`0233eba0af^:cypress/integration/rendering/treeView/treeView.spec.ts` in `/Users/knsv/repos/mermaid`). Choice (coordinator): keep the 12.2.0 files as they are (they are what the oracle shipped) and add each cypress original as its own fixture, listing each in the handoff.

## T2 (#572)

- From T1's review: T1's box pass keeps per-character `first`/`last` maps in place of v12's `lineMap`, and nothing checks them against v12's `remapErrorLines` over the corpus. T2 must gate box-mode error lines against v12's messages (oracle) and source columns per D486.

## T3 (#573)

- Exploration found v12's highlight box starts at the row's indent, not the label's x as the spec says, and each `:::highlight` row widens the diagram by 10 px cumulatively. Follow v12's code for the box origin (parity, D482's spirit); do not copy the cumulative widening unless the oracle shows it changes the viewBox, and record which.
- v12's viewBox clips its right edge by half the line thickness; v13 keeps contents inside the bounding box (D224).

## T4 (#575)

## T6 (#576)

## T5 (#577)

## T7 (#578)

## For the maintainer

- Follow-up, not this spec: `tagQuotes` now exists in three lexer copies (treemap, wardley, treeView). A core kit helper would dedupe them after M5b (no core change here, D481).
