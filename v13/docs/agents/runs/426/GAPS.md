# Gaps (spec #426)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Coordinator
- **Choice:** D381's shared palette is its own ticket, #506 (T0), not part of T4 or T5: it is the only core edit of the port (README "T0 core contract"), so it lands and is size- and identity-checked on its own. The vocabulary already lists the generic palette `plotColorArray` (empty), added by the Theme T0 (#414) for this purpose; #506 fills it in every theme spec.
- **Choice:** the theme table (`src/theme/vocabulary.ts`) lands with the renderer in T4 (#510), since T4 reads its colours; T5 (#513) adds the eleven-theme oracle specs, override fixtures, baselines and MIGRATION.md rows.

## #506 T0 chart series palette

## #507 T1 lexer

## #508 T2 parser

## #509 T3 layout

## #510 T4 renderer and theme table

## #512 T6 language facet

## #513 T5 integration
