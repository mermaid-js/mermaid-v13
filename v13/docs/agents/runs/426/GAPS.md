# Gaps (spec #426)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Coordinator
- **Choice:** D381's shared palette is its own ticket, #506 (T0), not part of T4 or T5: it is the only core edit of the port (README "T0 core contract"), so it lands and is size- and identity-checked on its own. The vocabulary already lists the generic palette `plotColorArray` (empty), added by the Theme T0 (#414) for this purpose; #506 fills it in every theme spec.
- **Choice:** the theme table (`src/theme/vocabulary.ts`) lands with the renderer in T4 (#510), since T4 reads its colours; T5 (#513) adds the eleven-theme oracle specs, override fixtures, baselines and MIGRATION.md rows.

## #506 T0 chart series palette

## #507 T1 lexer
- **Choice:** the dead `md_string` rules are ported as the one literal rule jison built from them (`T.DeadMdRule`, rule 26), so v13 skips that exact text as v12 does instead of dropping the rule; `md-string-dead-rule-*` cases fire it.
- `NOT_DRAWN_YET` in `theme-used-by.spec.ts` holds `xychart` until #510 reads a theme variable.
- Review fix: `v12-text.ts` cuts directives as v12's regex does (`v12Directives`), not by core's ranges, so an unclosed `%%{` takes the rest of the text (or ends after a word argument) as in v12. Quadrant's copy has the same gap (coordinator files it). #508: core still reports `UNCLOSED_DIRECTIVE` there; decide acceptance against the recorded quadrant/radar divergence.

## #508 T2 parser
- Closed: `x-axis Year2024 [a]` is rejected, with a hint to quote titles with digits.
- **Choice:** an unclosed `%%{` stays rejected (core `UNCLOSED_DIRECTIVE`), as quadrant and radar; six base cases listed in `divergences.json`, generated variants left out of the parity corpus.
- **Choice (for the maintainer):** an unclosed `accDescr {` is accepted as v12 does (it ends in an empty description), with a new `XYCHART_UNCLOSED_DESCRIPTION` warning; D383 lists only three warning kinds.
- **Choice (for the maintainer):** the in-text title wins over front matter even when it trims to `''` (v12 set front matter first), against the spec's "in-text if non-empty".
- **Choice (for the maintainer):** the x range is inferred from the first plot (the oracle), not the longest (the spec's text).
- **Choice (for the maintainer):** the oracle's v12 acceptance includes having a plot (`conformance/src/xychart/oracle-env.ts` wraps v12's parser), so `No Plot to render…` is compared as a rejection.
- Review fixes: `XYCHART_PLOT_BEFORE_AXIS` only for plots whose x data the final axis does not have; `XYCHART_NO_PLOT` not added to another error (an unclosed `%%{` that cut the text, a failed statement); the recovery set moved to `corpus/xychart-recovery.json` (23 cases); the grammar differential excludes nothing.
- Limit: statement-order parity runs every permutation up to four statement lines; beyond that only the reverse, rotations, and each line first and last.
- **Choice:** `orientation` is only `horizontal` when written in lower case (v12's `setOrientation` compares the token text), so `xychart HORIZONTAL` is vertical.

## #509 T3 layout
- Closed: `labelRotation` outside ±90 is 0, as v12 (`config.ts` reads a key only inside its schema range; `layout.spec.ts`, the `label-rotation-clamped-*` fixtures in parity).
- Closed: layout parity with v12's headless builder (`conformance/src/xychart/layout-parity.spec.ts`, 0.01 px) over the e2e corpus, seven config variants of it, and 1,254 corpus sources and statement orders both accept. Listed there: a missing band value (D383) and a line break in a text (D385). d3 parity (`ticks-parity.spec.ts`) against v12's own d3 7.9.0: `ticks` on 5,000+ ranges, both scales, `line()`.
- **Choice (for the maintainer):** a bar is held inside the plot box: its value end at the box edge, its sides cut there. v12 drew a value under an explicit minimum with a negative height, one over the maximum past the plot, and a plot written before a linear `x-axis` outside it. The invariant asks for it; output changes only for such values.
- **Choice:** a missing band value breaks a line (d3's `defined` gap), rather than joining its neighbours.
- **Choice:** legend markers get no data labels (v12 labelled every `rect`, so plot 0's values sat on legend swatches).
- **Choice:** point labels go through core label layout too (D385 lists the title, axis titles, categories and legend; point labels are author text like them).
- **Choice:** a config key is read when it is a number (or numeric string) in its schema range, else its default, silently (T5 decides warnings, as radar's T5 did). A non-numeric x on a linear axis (a plot before its range) draws at the axis start, as D386 does on a band axis. Values past ±1e300 (a 309-digit Infinity) are drawn there.
- **Deviation (for the maintainer):** v12, not the spec's wording, on two lengths (oracle-checked): outer padding is at most 0.2 of the space the axis is given (what is left beside the plot's reserved share), not of the axis; a bar is `0.95 · min(2 · outerPadding, tickDistance)` wide, not 0.95 of the band step.
- Limit: legend rows are `legendFontSize` apart (v12, the spec), so a legend name with `<br>` overlaps the next row.
- Pele (`pele@1.13.0`, `364JUB4J.js`) differs from v12's orchestrator: canvas clamped to 100–4000 px and scaled to the container; fixed paddings, font sizes (`0.875`/`0.75` of 16) and 4 px ticks instead of the `xyChart` config; adaptive tick count (`span/56` or `/80`, 2–10) and a "niced" y range that includes 0 with bars, ignoring an empty given range; band labels thinned and wrapped; bars grouped side by side from 0, clipped to the plot; lines clipped, with dots; legend rows 26 px, cut when they overflow; no `plotReservedSpacePercent`, `labelRotation` or data-label font search.

## #510 T4 renderer and theme table
- Exploration: `ThemeVarKind` has no palette kind for diagram table vars, and `flatten()` maps nested keys only onto table vars, so `xyChart.plotColorPalette` has no carrier yet; T4 picks one (record it). `theme-direction.spec.ts:113–118` asserts `plotColorArray` is unread; T4 updates it.
- Exploration: v12 draws data labels on every `rect`, so legend bar markers get labels too (`xychartRenderer.ts:102`); a missing band value throws in `.toString()`.

## #512 T6 language facet

## #513 T5 integration
- Exploration: `DIAGRAM_TABLES` in `conformance/src/diagram-themes.ts` needs xychart added by hand; `.changeset/pre.json` takes no row (add `.changeset/diagram-xychart-first-release.md`); every type's `completions/empty.out` golden changes.
