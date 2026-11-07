# Run notes, spec #424 (M5a kanban, `@mermaid-js/diagram-kanban`)

Integration branch `feature/424_kanban` (from `mermaid-v13` at dd4b9d19f). Draft PR: #476.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus restore | #451 | #285 (merged) | merged (ff e3b5b9d4d; package entry 2,830 B gz, no core change) |
| T2 grammar, parser, model, AST | #453 | #451 | done on `feature/453_kanban-parser` (handoff `tickets/453.md`; package entry 7,985 B gz, no core change) |
| T3 layout | #455 | #453 | merged (ff b5e02727e; package entry 10,785 B gz, core unchanged) |
| T4 SVG renderer | #457 | #455 (T0a merged in at d562508ea) | merged (ff 194da70d7; package entry 12,706 B gz, core 92,619 unchanged) |
| T6 language facet | #463 | #453 (merged); #406 via `feature/414_theme-t0` | done on `feature/463_kanban-language` (handoff `tickets/463.md`; package entry 14,176 B gz, `./language` 12,623 B gz, no core change) |
| T5 integration | #459 | #457, #463 | merged (ff dd96fc647; CDN core 92,309 B gz, +25 B registry row; package entry 14,421 B gz) |
| T7 ascii (Should) | #466 | #459 | in progress (`.claude/worktrees/t466`, `feature/466_kanban-ascii`) |

- `01-v12-kanban.md`: pointer notes on v12 grammar, DB, renderer, styles, shapes, corpus, the mindmap lexer to copy, Pele.
- `02-v13-core.md`: pointer notes on the plugin contract, `custom` ports, conformance wiring, core seams (labels, `checkUrl`, `w.outline`, palette, warnings, config, size guards).
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Merge order (coordinator)

- 2026-11-06: merging `mermaid-v13` 488a4bf5e (mindmap #406) here conflicts in 14 files with T0a (core theme specs, vocabulary, generated variables, MIGRATION.md). Aborted: `mermaid-v13` comes in through `feature/414_theme-t0` once T0 has merged it, so T0's resolution is the only one.

M4 wave 2 (gantt #398, gitGraph #404, mindmap #406) first, then the Theme T0 (#414), then the M5a ports. Merge `mermaid-v13` into this branch as each lands, keeping both sides; regenerate generated files rather than hand-merging.

## Core size (R-PERF-8, CDN limit 94,208 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (dd4b9d19f) | 91,530 B | — (2,678 B spare) |
| #451 T1 | 91,530 B | 0 (no core change) |
| #453 T2 | 92,619 B (bench measure) | 0 (no core change) |

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.

## Environment notes

- `check:grammar` "stale kanban grammar" was real, not a flake: `grammar/generated/` is gitignored and the four files were never committed, so local runs passed against the files on disk and CI's clean checkout failed. Fixed in a3cd2e0fb (`git add -f`, as mindmap and info do). Any new generated file under a `generated/` folder needs `git add -f`.
