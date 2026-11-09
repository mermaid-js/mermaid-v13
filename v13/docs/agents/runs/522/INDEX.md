# Run notes, spec #522 (M5b c4, `@mermaid-js/diagram-c4`)

Integration branch `feature/522_c4` (from `mermaid-v13` at 521fb76ee). Draft PR: (after T1 merges).

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus | #538 | #285 (merged) | merged (ff d0ab7516e; package entry 4,328 B gz, no core change) |
| T2 grammar, parser, model, AST | #539 | #538 | open |
| T3 layout (grid and relation router) | #540 | #539 | open |
| T4 SVG renderer | #541 | #540; block's T0 (#521, PR #589) merged into `mermaid-v13` | open |
| T5 integration | #542 | #541, #543 | open |
| T6 language facet | #543 | #539 | open |
| T7 ascii (Should) | #545 | #542 | open |

- `01-v12-c4.md`: pointer notes on v12 grammar, DB, renderer, shapes, specs, config, corpus, Pele.
- `02-v13-core.md`: pointer notes on the plugin contract, `custom` ports, conformance wiring, core seams, size guards.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Merge order (coordinator)

Wave 3 runs block #521, c4 #522 and agentflow #523 on AI-Max. Block's T0 (shape-geometry rows into core) merges into `mermaid-v13` before c4's T4. Merge `mermaid-v13` into this branch as it moves, keeping every side's rows; regenerate generated files, the lockfile and goldens rather than hand-merging.

## Core size (R-PERF-8, D546: 98,304 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (521fb76ee) | 93,891 B (`measureCoreSize`, static) | — (4,413 B spare) |
| #538 T1 | 93,891 B | 0 (no core change) |

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
