# Run notes, spec #293 (gantt)

Integration branch `feature/293_gantt` (from `mermaid-v13` at 38d663b44). Draft PR: #398.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| Package skeleton | — | — | on the integration branch (setup) |
| T0 core `now`, `availableWidth` on the context | #375 | — | merged (ff 46431e19d) |
| D1 dates and axis (Pele port) | #376 | — | merged (no-ff) |
| T1 lexer parity gate | #377 | #285 (merged) | merged (ff 935787bfe) |
| T2 grammar, parser, model, AST | #378 | #377 | open |
| T3 schedule and layout | #379 | #375, #376, #378 | open |
| T4 SVG renderer | #381 | #379 | open |
| T6 language facet | #382 | #378 | open |
| I1 interactions spec | #384 | #381 | open |
| T5 integration | #385 | #381, #382 | open |

- `01-v12-gantt.md`: pointer notes on v12 grammar, DB, renderer, styles, config, corpus, Pele.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Core size (R-PERF-8, limit 94,208 B gz)

| After | Core bytes | Spare | Note |
| --- | --- | --- | --- |
| base 38d663b44 | 93,551 | 657 | skeleton adds nothing to core |
| #375 T0 | 93,573 | 635 | `now`, `availableWidth` on the context (+22 B) |

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` (Playwright image) and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
