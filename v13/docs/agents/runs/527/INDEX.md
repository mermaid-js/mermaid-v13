# Run notes, spec #527 (M5b eventmodeling, `@mermaid-js/diagram-eventmodeling`)

Integration branch `feature/527_eventmodeling`, cut from `mermaid-v13` at `521fb76ee` (venn #533 merged). Worktree: `/Users/ashishj/repos/mermaid-v13/.claude/worktrees/w4-eventmodeling`.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate on the Langium oracle | #600 | — | merged (ff 85478e5c0; `./testing` 3.6 KB gz, no core change) |
| T2 grammar, parser, model, AST, ported specs | #602 | #600 | open |
| T3 custom layout (`EventModelLayout`) | #604 | #602 (soft) | open |
| T4 SVG renderer and theme table | #606 | #602, #604 | open |
| T6 language facet | #609 | #602 | open |
| T5 integration | #611 | #606, #609 | open |

No T0 (no core change) and no T7 (D320). One ticket agent at a time (the machine is shared by the wave 4 sessions).

- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Merge order

Wave 4 (architecture, railroad, eventmodeling, swimlane) runs in parallel with wave 3. When `mermaid-v13` moves, merge it here, keep every side's rows, and regenerate generated files, the lockfile and goldens rather than hand-merging them (D112).

## Finish rule

The integration PR stays a draft until all of these hold; then `gh pr ready <PR> -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above is merged into `feature/527_eventmodeling`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `mermaid-v13` is merged in; `pnpm check` and `pnpm e2e` pass locally, under the lock, and hosted CI is green.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gated core size and the issues to close.
