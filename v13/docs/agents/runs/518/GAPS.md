# GAPS, spec #518 (treeView)

Unmet criteria and choices not covered by the spec or its D-ids, per ticket. "For the maintainer" items go into the PR body.

## T1 (#571)

- D486 corpus comparison: the 15 `e2e/diagrams/tree-view/*.mmd` are byte-identical to 12.2.0's own e2e files; 8 were flattened upstream in v12 commit `7a38a04a6` against the cypress originals (`0233eba0af^:cypress/integration/rendering/treeView/treeView.spec.ts` in `/Users/knsv/repos/mermaid`). Choice (coordinator): keep the 12.2.0 files as they are (they are what the oracle shipped) and add each cypress original as its own fixture, listing each in the handoff. Done in #571 (`nightly-check/cypress-*.mmd`, 8; the custom-config one without the template's leading blank line and trailing blank line, which v12 rejects; the raw text is a case, excluded for core's front matter reading).
- #571 choices: a `│` line the box pass drops gets no token; on a box-pass error the lexer lexes the text unrewritten and `box.error` carries v12's message, line and the source line range (T2 reports it at the source column, D486).

## T2 (#572)

- From T1's review: T1's box pass keeps per-character `first`/`last` maps in place of v12's `lineMap`, and nothing checks them against v12's `remapErrorLines` over the corpus. T2 must gate box-mode error lines against v12's messages (oracle) and source columns per D486. Done in #572: `conformance/src/treeView/box-errors.spec.ts` (61 rejected box sources by line, 17 by column, 6 of them where the source column is not v12's).
- #572 choices (no D-id; listed in `tickets/572.md`): four warnings for v12 traps it accepts (`TREEVIEW_NODES_ON_ONE_LINE`, `TREEVIEW_TRAILING_BLANK`, `TREEVIEW_ANNOTATION_NEXT_LINE`, `TREEVIEW_NAME_READ_AS_TITLE`); `STRAY_BLANK` at the blank, not at the next indent where v12 reported; the model's `cssClass?: string` for the spec's "classes" (v12 keeps one); after a box error the text is parsed unrewritten, so errors inside box lines show once it is fixed.
- For T4 (#575): `src/icons.ts` `resolveIcon` (v12's `getNodeIcon`) landed in #572 for `icons.spec.ts`. Its built-in name check is own-property, so `icon(constructor)` takes `defaultIconPack` where v12 gave `mermaid-treeview:constructor` (D486's spirit): list it with the render changes.

## T3 (#573)

- Exploration found v12's highlight box starts at the row's indent, not the label's x as the spec says, and each `:::highlight` row widens the diagram by 10 px cumulatively. Follow v12's code for the box origin (parity, D482's spirit); do not copy the cumulative widening unless the oracle shows it changes the viewBox, and record which.
- v12's viewBox clips its right edge by half the line thickness; v13 keeps contents inside the bounding box (D224).

## T4 (#575)

## T6 (#576)

## T5 (#577)

## T7 (#578)

## For the maintainer

- Follow-up, not this spec: `tagQuotes` now exists in three lexer copies (treemap, wardley, treeView). A core kit helper would dedupe them after M5b (no core change here, D481).
