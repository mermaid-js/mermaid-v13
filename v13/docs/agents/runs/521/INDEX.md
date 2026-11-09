# Run notes, spec #521 (M5b block, `@mermaid-js/diagram-block`)

Integration branch `feature/521_block` (from `mermaid-v13` at 521fb76ee). Draft PR: (after the first ticket merges).

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 shape-geometry theme rows move to core | #552 | — | merged into `mermaid-v13` as #589 (ad3648a91); merged into `feature/521_block` |
| T1 lexer parity gate | #553 | #285 (merged) | |
| T2 grammar, parser, model, AST | #554 | #553 | |
| T3 layout | #555 | #554 | |
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
