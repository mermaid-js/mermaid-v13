# Run notes, spec #518 (M5b treeView, `@mermaid-js/diagram-treeview`)

Integration branch `feature/518_treeview` (draft PR #627), cut from `mermaid-v13` at `521fb76ee` (M5a merged, D546). Worktree: `/Users/knsv/repos/mermaid-v13/.claude/worktrees/518-treeview-e1abe2`. Machine: AI-Max (seven wave-3 ports share it; the coordinator runs on Office-max).

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate, box-drawing pass and corpus | #571 | — | merged (--no-ff; `./testing` 4.4 KB gz, no core change) |
| T2 grammar, parser, model, AST | #572 | #571 | merged (--no-ff; runtime 9.2 KB gz, `./testing` 4.6 KB gz, no core change) |
| T3 custom row layout (`TreeViewLayout`) | #573 | #572 (soft) | merged (ff; runtime 10.5 KB gz, `./testing` 6.7 KB gz; core: `fontFamily` usedBy only) |
| T4 SVG renderer, icons and theme table | #575 | #572, #573 | open |
| T6 language facet | #576 | #572 | merged (--no-ff; `./language` 13.2 KB gz, runtime 11.6 KB gz, no core change) |
| T5 integration | #577 | #575, #576 | open |
| T7 ASCII renderer (Should, D320, D488) | #578 | #572, #577 | open |

No T0 (no core change, D481). One ticket agent at a time (AI-Max rule).

- `01-v12-treeview.md`: pointer notes on v12 grammar, box pass, DB, renderer, styles, specs, corpus.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Merge order

Wave 3 (block #521, c4 #522, agentflow #523, usecase #517, treeView #518, ishikawa #519, requirement #520) runs in parallel, wave 4 elsewhere. When `mermaid-v13` moves, merge it here, keep every side's rows, and regenerate generated files, the lockfile and goldens rather than hand-merging them (D112).

## Finish rule

The integration PR stays a draft until all of these hold; then `gh pr ready <PR> -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above is merged into `feature/518_treeview`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `mermaid-v13` is merged in; `pnpm check` and `pnpm e2e` pass locally, under the lock, and hosted CI is green.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gated core size and the issues to close.

## CI log

- `28513490c` (T3 + mermaid-v13): run 42672206856 marked failure with no failing job. Attempt 1 ran only "Check and build" (pass) and attempt 2 only the other four (all pass), so the jobs were not scheduled. Infrastructure, not the branch; the next push gives a clean run.
