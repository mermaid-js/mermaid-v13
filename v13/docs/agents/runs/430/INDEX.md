# Run notes, spec #430 (wardley)

Integration branch `feature/430_wardley`, cut from `mermaid-v13` at `12ba676cb` (kanban #476 merged). Worktree: `/Users/knsv/repos/mermaid-v13/.claude/worktrees/430-wardley-3fdfd3`.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate on the Langium oracle | #487 | — | open |
| T2 grammar, parser, model, AST, ported specs | #489 | #487 | open |
| T3 custom layout (`WardleyLayout`) | #490 | #489 (soft) | open |
| T4 SVG renderer and theme table | #493 | #489, #490 | open |
| T6 language facet | #500 | #489 | open |
| T5 integration | #497 | #493, #500 | open |

No T0 (the theme table API is #414's, merged) and no T7 (D320).

- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and orchestrator choices, per ticket.
- `01-v12-wardley.md`, `02-v13-seams.md`: exploration pointers.
- `tickets/<n>.md`: handoffs.

## Order

One ticket agent at a time (five wave-2 ports share AI-Max): T1 → T2 → T3 → T4 → T6 → T5. T6 lands before T5, as radar's did, so the manifest gets its `language` entry once and no `NO_LANGUAGE_YET` exemption is needed.

## Shared files (wave 2 runs xychart, sankey, treemap, venn and wardley in parallel)

Registry, detector, `HARVESTS`, `LANGIUM_LEXERS`, knip entries, theme vocabulary lists, adapter regex, MIGRATION.md, RELEASING.md. When `mermaid-v13` moves, merge it, keep every side's rows, and regenerate generated files and goldens rather than hand-merging them (D112).

## Finish rule

The integration PR stays a draft until all of these hold; then `gh -R mermaid-js/mermaid-v13 pr ready <PR>` (never merge it):
1. Every ticket above is merged into `feature/430_wardley`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check` and `pnpm e2e` pass locally, under the lock, and hosted CI is green.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gz size and the issues to close.
