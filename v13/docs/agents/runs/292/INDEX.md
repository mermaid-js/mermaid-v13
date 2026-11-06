# Run notes, spec #292 (gitGraph)

Integration branch `feature/292_gitgraph` (from `mermaid-v13` 38d663b44). Draft PR: opened after the first ticket merge.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #368 | — | merged (ff 189662975) |
| T4a `git`, `gitInv`, `gitBranchLabel` palettes | #369 | — | open |
| T2 grammar, parser, model, AST | #370 | #368 | open |
| T3 custom layout (`GitLayout`) | #371 | #370 (hand-built fixtures meanwhile) | open |
| T6 language facet | #372 | #370 | open |
| T4 SVG renderer | #373 | #371, #369 | open |
| T5 integration | #374 | #373, #372 | open |

- `01-v12-gitgraph.md`: pointer notes on v12 grammar, DB, renderer, styles, themes, corpus and the v13 seams.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Core size (R-PERF-8, `packages/bench/src/core-size.spec.ts`, limit 94,208 B gz)

| Point | Core gz | Spare |
| --- | --- | --- |
| `mermaid-v13` 38d663b44 (start) | 93,551 | 657 |

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` (Playwright image) and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
