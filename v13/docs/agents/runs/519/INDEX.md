# Run notes, spec #519 (M5b ishikawa, `@mermaid-js/diagram-ishikawa`)

Integration branch `feature/519_ishikawa` (from `mermaid-v13` at 521fb76ee). Draft PR: #626.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #580 | #285 (merged) | merged (ff 40d678fff; package entry 1,803 B gz, no core change) |
| T2 grammar, parser, model, AST | #581 | #580 | merged (ff a2cab0f30; package entry 4,178 B gz, no core change) |
| T3 fishbone layout | #582 | #581 | merged (ff 8deb7a764; package entry 7,154 B gz, no core code change) |
| T4 SVG renderer | #583 | #582 | merged (ff ff665803f; package entry 8,478 B gz; core 94,412 B gz unchanged) |
| T6 language facet | #584 | #581 | — |
| T5 integration | #585 | #583, #584 | — |
| T7 ASCII outline (optional) | #586 | #585 | — |

- `01-v12-ishikawa.md`: pointer notes on v12's grammar, DB, renderer, specs, docs page and the corpus.
- `02-v13-seams.md`: pointer notes on the plugin contract, `custom` ports, conformance wiring and the seams T1–T7 touch.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Wave 3

block #521, c4 #522, agentflow #523, usecase #517, treeView #518, ishikawa #519 and requirement #520 run in parallel on AI-Max: at most one ticket agent at a time here. Shared lists conflict (registry, detectors, `SECTION_OWNERS`, `HARVESTS`, `JISON_TYPES`, knip, theme vocabulary lists, adapter regex, language goldens' `empty.out`, licence tables, MIGRATION.md, RELEASING.md): when `mermaid-v13` moves, merge it, keep every side's rows, regenerate generated files, the lockfile and goldens.

## Core size (R-PERF-8, D546 limit 98,304 B gz, `measureCoreSize`)

| After | Core gz | Δ |
| --- | --- | --- |
| base (521fb76ee) | 93,891 | — |

## Worktrees

Ticket worktrees live at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>`, never inside the integration worktree: `knip --no-gitignore` in the pre-push `pnpm check` scans nested worktrees and fails (it blocked the first push).
