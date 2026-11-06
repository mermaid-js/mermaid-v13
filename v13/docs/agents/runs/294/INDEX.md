# Run notes, spec #294 (mindmap and the core `tree` engine)

Integration branch `feature/294_mindmap` (from `mermaid-v13` at 38d663b44). Draft PR: #406.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 core `tree` engine and engine selection | #380 | — | merged (ff a635d9bcb; `tree` chunk 3,407 B gz, lazy) |
| T1 lexer parity gate | #383 | #285 (merged) | merged (ff 5bbf475e9) |
| T2 grammar, parser, model, AST | #386 | #383 | in progress (`.claude/worktrees/t386`, `feature/386_mindmap-parser`) |
| T3 layout (builder, shape sizing) | #387 | #386, #380 | in progress on hand-built fixtures (`.claude/worktrees/t387`, `feature/387_mindmap-layout`); merges after #386 |
| T4 SVG renderer | #388 | #387 | blocked |
| T6 language facet | #389 | #386 | blocked |
| T5 integration | #390 | #388, #389 | blocked |
| icons I5 `::icon()` glyphs | #328 | #322 (merged), #388 | blocked |
| hand-drawn H4 baselines | #344 | #390 | blocked |

- `01-v12-mindmap.md`: pointer notes on v12 grammar, DB, renderer, styles, shapes, tidy-tree, corpus, Pele.
- `02-v13-core.md`: pointer notes on core's layout contract, engine selection, registry, size guards.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Core size (R-PERF-8, limit 94,208 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (38d663b44) | 93,551 B | — (657 B spare) |
| #383 T1 | 93,551 B | 0 (no core change) |
| #380 (tree loader, engine selection) | 93,760 B | +209 (448 B spare) |
| #386 T2 | 93,760 B | 0 (no core change) |

- Coordinator, 2026-11-06: `fix/theme-variables-pure` (gitGraph's find: core keeps the whole `THEME_VARIABLES` inventory) drops about 1.3 KB gz from core. Merge `mermaid-v13` when it lands. Until then, a ticket that would go over the gate records its bytes and the run continues with the tickets that don't depend on it.

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` (Playwright image) and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
