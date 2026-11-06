# Run notes, spec #424 (M5a kanban, `@mermaid-js/diagram-kanban`)

Integration branch `feature/424_kanban` (from `mermaid-v13` at dd4b9d19f). Draft PR: opened after the first ticket merge.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus restore | #451 | #285 (merged) | open |
| T2 grammar, parser, model, AST | #453 | #451 | blocked |
| T3 layout | #455 | #453 | blocked (may start on hand-built models) |
| T4 SVG renderer | #457 | #455; colours #414 T0a | blocked |
| T6 language facet | #463 | #453; #406 (`LanguageFacet.standalone`) | blocked |
| T5 integration | #459 | #457, #463, #414 T0a | blocked |
| T7 ascii (Should) | #466 | #459 | blocked |

- `01-v12-kanban.md`: pointer notes on v12 grammar, DB, renderer, styles, shapes, corpus, the mindmap lexer to copy, Pele.
- `02-v13-core.md`: pointer notes on the plugin contract, `custom` ports, conformance wiring, core seams (labels, `checkUrl`, `w.outline`, palette, warnings, config, size guards).
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Merge order (coordinator)

M4 wave 2 (gantt #398, gitGraph #404, mindmap #406) first, then the Theme T0 (#414), then the M5a ports. Merge `mermaid-v13` into this branch as each lands, keeping both sides; regenerate generated files rather than hand-merging.

## Core size (R-PERF-8, CDN limit 94,208 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (dd4b9d19f) | 91,530 B | — (2,678 B spare) |

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
