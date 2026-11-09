# Run notes, spec #521 (M5b block, `@mermaid-js/diagram-block`)

Integration branch `feature/521_block` (from `mermaid-v13` at 521fb76ee). Draft PR: #623.

Worktrees: ticket branches are checked out one at a time in this session's own worktree (`521-block-7f431e`); `feature/521_block` lives in `/Users/knsv/repos/mermaid-v13/.claude/worktrees/b521`, used only for merges and pushes. (Agents of this session can only write inside its own worktree.)

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 shape-geometry theme rows move to core | #552 | — | merged into `mermaid-v13` as #589 (ad3648a91); merged into `feature/521_block` |
| T1 lexer parity gate | #553 | #285 (merged) | merged (ff 7dfe6e49d; package entry 4,623 B gz, no core change) |
| T2 grammar, parser, model, AST | #554 | #553 | merged (ff f8bf0c3c2; package entry 11,883 B gz, no core change) |
| T3 layout | #555 | #554 | handoff `tickets/555.md` (package entry 17,338 B gz; core usedBy rows, core/theme +12 B gz) |
| T4 SVG renderer and local shapes | #556 | #552, #555 | |
| T6 language facet | #557 | #554 | |
| T5 integration | #558 | #556, #557 | |
| T7 ASCII renderer (optional, D320) | #559 | #558 | |

- `01-v12-block.md`: pointer notes on v12 grammar, DB, layout, renderer, shapes, specs, corpus, Pele.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.
- The v13 core and conformance pointers in `../429/02-v13-core.md` still hold for a `custom` jison port; re-check line numbers before relying on them.

## Wave 3

Block #521, c4 #522 and agentflow #523 run in parallel on AI-Max: at most one ticket agent at a time per port, `pnpm check` / `pnpm e2e` / push under `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock` with `VITEST_MAX_WORKERS=4`. Block's T0 (#552) is the shared core change c4 and agentflow wait for. Shared lists conflict (registry, detectors, `SECTION_OWNERS`, `HARVESTS`, `JISON_TYPES`, knip, theme vocabulary lists, adapter regex, language goldens' `empty.out`, licence tables, MIGRATION.md, RELEASING.md): when `mermaid-v13` moves, merge it, keep every side's rows, regenerate generated files, the lockfile and goldens.

## Core size (R-PERF-8, D546: 98,304 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (521fb76ee) | 93,891 | — |
| T0 #552 | 94,217 | +326 |

## PAUSED (2026-11-09, Knut: AI-Max overloaded; resume only on the coordinator's "RESUME")

- **Integration:** `feature/521_block` at f3fa2c8e6 (T0 via #589, T1, T2, `mermaid-v13` merged), pushed, pre-push check green. Draft PR #623. Checked out in `/Users/knsv/repos/mermaid-v13/.claude/worktrees/b521`.
- **In flight:** T3 #555 on `feature/555_block_layout` at f7274d888 (this worktree, `521-block-7f431e`). Implementation committed; resume point in `tickets/555.md`. Scoped checks green; the full `pnpm check` (needed: T3 touches core `usedBy`) was killed by the pause and must run again, then merge `feature/521_block` and rerun the handoff checks.
- **Then:** `/code-review` of T3, ff into `feature/521_block` (in b521), merge `mermaid-v13`, push. Next tickets: T4 #556 (renderer, needs T3) and T6 #557 (language, needs T2) one at a time, then T5 #558, then T7 #559.
- **Open for the maintainer:** see GAPS.md (two D440 items from T2, two from T3).
