# Run notes, spec #428 (M5a treemap, `@mermaid-js/diagram-treemap`)

Integration branch `feature/428_treemap`, cut from `mermaid-v13` at `12ba676cb` (kanban #476 merged). Worktree: `/Users/knsv/repos/mermaid-v13/.claude/worktrees/428-treemap-637b22`.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate on the Langium oracle | #483 | — | merged (ff eba522b95; `testing` entry 2.3 KB gz, no core change) |
| T2 grammar, parser, model, AST, ported specs | #484 | #483 | open |
| T3 custom layout (`TreemapLayout`) and `valueFormat` | #485 | #484 (soft) | open |
| T4 SVG renderer and theme table | #505 | #484, #485 | open |
| T6 language facet | #511 | #484 | open |
| T5 integration | #514 | #505, #511 | open |

No T0 (treemap adds no core contract; the theme table API is #414's, merged) and no T7 (D320). One ticket agent at a time (the machine is shared by five wave-2 sessions).

- `01-v12-treemap.md`: pointer notes on v12 grammar, DB, renderer, styles, specs, corpus.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Merge order

Wave 2 (xychart #426, sankey #427, treemap #428, venn #429, wardley #430) runs in parallel. When `mermaid-v13` moves, merge it here, keep every side's rows, and regenerate generated files and goldens rather than hand-merging them (D112).

## Finish rule

The integration PR stays a draft until all of these hold; then `gh pr ready <PR> -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above is merged into `feature/428_treemap`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check` and `pnpm e2e` pass locally, under the lock, and hosted CI is green.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gz size and the issues to close.
