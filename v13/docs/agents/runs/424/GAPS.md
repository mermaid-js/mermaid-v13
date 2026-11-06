# Gaps (spec #424)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #451 T1 lexer and corpus
- **Choice:** `kanbanTokens` text applies `kanban.jison`'s two action rewrites (`@{` reads `''`; `\n\s*` in a quoted run of shape data reads `<br/>`, and a run left open at the end gains one for v12's appended `\n`), so the gate has no image exclusion beyond the no-token kinds.
- **Choice:** every edge case is in `corpus/kanban-cases.json` (repo rule), not in TS arrays as mindmap's `EDGE_CASES`; the generated variants add CRLF, tabs and multi-line `@{` to mindmap's three.
- **Choice:** fixtures beyond the spec's list: the two 12.2.0 `packages/examples` boards, `theme-dark`/`theme-forest`, `section-width`, `priority-other-values`, `ticket-links`. New fixtures go in nightly-check; the two columns-only ones in pr-check beside the originals.
- Pele cross-check not done: `/Users/knsv/repos/pele` is not on this machine.

## #453 T2 parser

## #455 T3 layout

## #457 T4 renderer
- Column colours (D374) wait for the Theme T0's T0a API (#414): the package `DiagramPlugin.theme` table and the `dark` trait.

## #463 T6 language facet

## #459 T5 integration
- Waits for #414 T0a (theme table) as well as T4 and T6.

## #466 T7 ascii (Should)
