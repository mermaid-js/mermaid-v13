# GAPS, spec #518 (treeView)

Unmet criteria and choices not covered by the spec or its D-ids, per ticket. "For the maintainer" items go into the PR body.

## T1 (#571)

- D486 corpus comparison: the 15 `e2e/diagrams/tree-view/*.mmd` are byte-identical to 12.2.0's own e2e files; 8 were flattened upstream in v12 commit `7a38a04a6` against the cypress originals (`0233eba0af^:cypress/integration/rendering/treeView/treeView.spec.ts` in `/Users/knsv/repos/mermaid`). Choice (coordinator): keep the 12.2.0 files as they are (they are what the oracle shipped) and add each cypress original as its own fixture, listing each in the handoff. Done in #571 (`nightly-check/cypress-*.mmd`, 8; the custom-config one without the template's leading blank line and trailing blank line, which v12 rejects; the raw text is a case, excluded for core's front matter reading).
- #571 choices: a `│` line the box pass drops gets no token; on a box-pass error the lexer lexes the text unrewritten and `box.error` carries v12's message, line and the source line range (T2 reports it at the source column, D486).

## T2 (#572)

- From T1's review: T1's box pass keeps per-character `first`/`last` maps in place of v12's `lineMap`, and nothing checks them against v12's `remapErrorLines` over the corpus. T2 must gate box-mode error lines against v12's messages (oracle) and source columns per D486. Done in #572: `conformance/src/treeView/box-errors.spec.ts` (100 rejected box sources by the primary diagnostic's line, 62 box errors by source column, 38 rewritten columns taken back to the source, 24 of them where the source column is not v12's).
- #572 choices (no D-id; listed in `tickets/572.md`): four warnings for v12 traps it accepts (`TREEVIEW_NODES_ON_ONE_LINE`, `TREEVIEW_TRAILING_BLANK`, `TREEVIEW_ANNOTATION_NEXT_LINE`, `TREEVIEW_NAME_READ_AS_TITLE`); `STRAY_BLANK` at the blank, not at the next indent where v12 reported; the model's `cssClass?: string` for the spec's "classes" (v12 keeps one). After a box error the parser reads the rewrite with the rejected lines dropped, so errors on the other box lines are reported too (recovery set): sound because v12's rules are per line (depth from the line's own column, one segment width for the text), so dropping a rejected line changes no other line's rewrite; a node under a dropped empty node goes under the node before it.
- For T4 (#575): `src/icons.ts` `resolveIcon` (v12's `getNodeIcon`) landed in #572 for `icons.spec.ts`; see "For the maintainer" for its one change from v12.

## T3 (#573)

- Exploration found v12's highlight box starts at the row's indent, not the label's x as the spec says, and each `:::highlight` row widens the diagram by 10 px cumulatively. Follow v12's code for the box origin (parity, D482's spirit); do not copy the cumulative widening unless the oracle shows it changes the viewBox, and record which.
- v12's viewBox clips its right edge by half the line thickness; v13 keeps contents inside the bounding box (D224).
- Done in #573. Highlight origin: the row's indent (v12's `x`), not the label's x. Cumulative widening: **kept**. The oracle's code (`renderer.ts:202-213`) sets `totalWidth` to `x + (totalWidth − x + 8) + 2`, i.e. +10 px for every highlighted row, so it always changes v12's viewBox width (and each later box ends 10 px further right). P1 and D224 ("output changes only where v12 clipped") keep it; `TREEVIEW_METRICS.highlightSlack` is v12's `+ 2`. For the maintainer below.
- Done in #573. Bounds: v12's viewBox (`−lineThickness/2`, 0, `totalWidth`, `totalHeight`), grown only where a label, icon, description, highlight box (stroke 1) or line (with its half thickness) reaches past it; at the defaults it is v12's viewBox exactly. The root row's connector (from `−rowIndent` to 0) is not in the layout (D482).
- #573 choices (no D-id): an empty name (a node written `/`) measures 0 × 0 (v12's `getBBox` of an empty text), so its row is `2·paddingY` high; the root row gets a folder icon under `showIcons`, as v12 resolved its icon too; config lengths read as v12's defaults when missing, negative or not numeric (numeric strings as their number), `showIcons` by v12's truthiness, warnings left to #577; the label size is v12's 16 px from `TREEVIEW_METRICS.labelFontSize`, read only in `labelFont` (`layout/layout.ts`), which #575 points at `treeViewLabelFontSize`.

## T4 (#575)

## T6 (#576)

## T5 (#577)

- Port v12's `db.spec.ts` `getConfig` test with the config work (the `treeView` options move to `honoured`): #572 skips it with this pointer, as no D-id puts it in T2.

## T7 (#578)

## For the maintainer

- Follow-up, not this spec: `tagQuotes` now exists in three lexer copies (treemap, wardley, treeView). A core kit helper would dedupe them after M5b (no core change here, D481).
- v12 change (#572, kept): `icon(constructor)` (or `toString`, any name on `Object.prototype`) with a `defaultIconPack` is `pack:constructor`, as the spec says (built-in glyphs only for `file` and `folder`); v12 gave `mermaid-treeview:constructor`, its built-in check reading through the prototype.
- v12 bug kept for parity (#573, GAPS T3): every `:::highlight` row widens the diagram by 10 px and makes each later highlight box 10 px wider than the one before, so the boxes do not end at one right edge. Fixing it (one right edge at the width + 8) changes output only for diagrams with highlights; it needs a D-id.
- Kit follow-up, not this spec: treeView's `lineView`/`recover` (as treemap's) re-implement `significantTokens`/`skipTo` (pitfall 7) because `TokenView` has no stream index or line-start flag. Adding those to the kit would let both parsers use it.
