# Run notes, spec #517 (M5b usecase, `@mermaid-js/diagram-usecase`)

Integration branch `feature/517_usecase` (from `mermaid-v13` at 521fb76ee). Draft PR: none yet.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 core rows + `slot()` | #561 | — | merged into `mermaid-v13` as #620 (ade398e6b) |
| T1 lexer parity gate | #562 | — | merged (a37507281; `./testing` 4.9 KB gz, no core change) |
| T2 grammar, parser, model, AST | #563 | #562 | open |
| T3 layout | #565 | #563 | open |
| T4 SVG renderer and theme table | #566 | #565, #561 | open |
| T5 integration | #567 | #561, #566 | open |
| T6 language facet | #568 | #563 | open |
| T7 ASCII (Should) | #569 | #565, #567 | open |

- `01-v12-usecase.md`: pointer notes on v12 lexer, parser, model builder, DB, renderer, shapes, specs, corpus.
- `02-v13-core.md`: pointer notes on the plugin contract, graph ports, conformance wiring, core seams.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Wave 3

block #521, c4 #522, agentflow #523, usecase #517, treeView #518, ishikawa #519 and requirement #520 run in parallel on AI-Max: at most one ticket agent at a time here. Shared lists conflict: when `mermaid-v13` moves, merge it, keep every side's rows, regenerate generated files, the lockfile and goldens.

## Core size (R-PERF-8, D546 limit 98,304 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (521fb76ee) | 93,891 | — |
| #620 T0 (on `mermaid-v13` after block's #589, 94,217) | 94,352 | +135 (`slot()`, two rows, `contrastCss` module split) |
| #562 T1 | 94,352 | 0 (no core or registry change) |

## Merge log

- 2026-11-09: `feature/562_usecase-lexer` merged (a37507281, after a two-axis review: eight small fixes). `mermaid-v13` f71e9a58b (block T0 #589, usecase T0 #620, …) merged in 6f2952b08, clean; `theme-used-by.spec.ts` gains `LISTED_AHEAD` (usecase on `actorBkg`/`actorBorder` before its renderer reads them).

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
