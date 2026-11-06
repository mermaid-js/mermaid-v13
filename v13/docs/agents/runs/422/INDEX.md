# Run notes, spec #422 (radar)

Integration branch `feature/422_radar`, cut from `mermaid-v13` at `dd4b9d19f` (#411 merged: D314–D339, D341–D428, D540–D541). Worktree: `/Users/knsv/repos/mermaid-v13/.claude/worktrees/422-radar-0da684`.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate on the Langium oracle | #445 | — | open |
| T2 grammar, parser, model, AST, ported specs | #446 | #445 | open |
| T3 custom layout (`RadarLayout`) | #447 | #446 (soft) | open |
| T4 SVG renderer | #448 | #446, #447 | open |
| T5 integration | #449 | #448, #414 T0a | open |
| T6 language facet | #450 | #446 | open |

No T0 (radar adds no core contract; the theme table comes from #414 T0a, D322, D335) and no T7 (D320).

- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and orchestrator choices, per ticket.
- `tickets/<n>.md`: handoffs.
- Worked example: pie (`packages/diagram-pie`, run notes `../288/`), the other Langium type. Its `tickets/304.md` documents the shared `loadLangiumLexerOracle` API (D220).

## Theme work waits on #414 T0a

Radar's ten variables go in a package `DiagramPlugin.theme` table (D322, D331, D335, D540), from `feature/414_theme-t0`, merged at `462aef4e9`. T4 (#448) adds the table with the plugin; T5 integrates.

## Merge order

M4 wave 2 (gantt #398, gitGraph #404, mindmap #406), then the Theme T0 (#414), then the M5a ports. Merge `mermaid-v13` into `feature/422_radar` as each lands, keeping both sides; regenerate generated files, never hand-merge them (D112).

## Finish rule

The integration PR stays a draft until all of these hold; then `gh pr ready <PR> -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above is merged into `feature/422_radar`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check` and `pnpm e2e` pass locally, under the locks, and hosted CI is green.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gz size and the issues to close.
