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
- Closed: the x range is inferred from the **first** plot (oracle: `bar [1,2]` then `line [1,2,3,4]` gives `1 --> 2`); the model follows it, not the spec's "longest".
- Closed: `x-axis Year2024 [a]` is rejected, with a hint to quote titles with digits.
- **Choice:** an unclosed `%%{` stays rejected (core `UNCLOSED_DIRECTIVE`), as quadrant and radar; six base cases listed in `divergences.json`, generated variants left out of the parity corpus.
- **Choice:** an unclosed `accDescr {` is accepted as v12 does (it ends in an empty description), with a `XYCHART_UNCLOSED_DESCRIPTION` warning.
- **Choice:** the in-text title wins over front matter even when it trims to `''` (v12 set front matter first), against the spec's "in-text if non-empty".
- **Choice:** `orientation` is only `horizontal` when written in lower case (v12's `setOrientation` compares the token text), so `xychart HORIZONTAL` is vertical.

## #509 T3 layout
- Exploration: `labelRotation` outside ±90 becomes 0 in v12, not clamped (`baseAxis.ts:37–40`); the spec says "clamped". Follow v12 (`label-rotation-clamped-*` fixtures).
- Exploration: v12's builder runs headless (text measured as `len × fontSize`), so a layout-parity spec against it is possible, as quadrant's `layout-parity.spec.ts`. The exact d3 oracle is local: `d3-array@3.2.4/src/ticks.js`, `d3-scale@4.0.2/src/band.js`.

## #510 T4 renderer and theme table
- Exploration: `ThemeVarKind` has no palette kind for diagram table vars, and `flatten()` maps nested keys only onto table vars, so `xyChart.plotColorPalette` has no carrier yet; T4 picks one (record it). `theme-direction.spec.ts:113–118` asserts `plotColorArray` is unread; T4 updates it.
- Exploration: v12 draws data labels on every `rect`, so legend bar markers get labels too (`xychartRenderer.ts:102`); a missing band value throws in `.toString()`.

## #512 T6 language facet

## #513 T5 integration
- Exploration: `DIAGRAM_TABLES` in `conformance/src/diagram-themes.ts` needs xychart added by hand; `.changeset/pre.json` takes no row (add `.changeset/diagram-xychart-first-release.md`); every type's `completions/empty.out` golden changes.
