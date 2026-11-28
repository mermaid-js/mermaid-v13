# Run notes, spec #521 (M5b block, `@mermaid-js/diagram-block`)

Integration branch `feature/521_block` (from `mermaid-v13` at 521fb76ee). Draft PR: #623.

Worktrees: ticket branches are checked out one at a time in this session's own worktree (`521-block-7f431e`); `feature/521_block` lives in `/Users/knsv/repos/mermaid-v13/.claude/worktrees/b521`, used only for merges and pushes. (Agents of this session can only write inside its own worktree.)

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 shape-geometry theme rows move to core | #552 | — | merged into `mermaid-v13` as #589 (ad3648a91); merged into `feature/521_block` |
| T1 lexer parity gate | #553 | #285 (merged) | merged (ff 7dfe6e49d; package entry 4,623 B gz, no core change) |
| T2 grammar, parser, model, AST | #554 | #553 | merged (ff f8bf0c3c2; package entry 11,883 B gz, no core change) |
| T3 layout | #555 | #554 | merged (ff e7fef7bd3; package entry 17,666 B gz, no core change) |
| T4 SVG renderer and local shapes | #556 | #552, #555 | merged (ff 3c3553fc4; package entry 20,507 B gz, no core change) |
| T6 language facet | #557 | #554 | merged (ff b9f104d0d; package entry 20,898 B gz, `./language` 16,721 B gz; shared language-service: one frozen empty modifiers array, `deepFreeze` without per-object key arrays) |
| T5 integration | #558 | #556, #557 | merged (ff 813312af7; core 94,429 B gz, block rows +17 B; package entry 20,778 B gz; warm render 118× geomean vs 12.2.0) |
| T7 ASCII renderer (optional, D320) | #559 | #558 | merged (ff fac2b7f19; package entry 21,039 B gz, `./ascii` 7,009 B gz; text load path 13,232 B gz, the largest type, under the soft 15 KB of D87) |

- `01-v12-block.md`: pointer notes on v12 grammar, DB, layout, renderer, shapes, specs, corpus, the reference implementation.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.
- Final whole-branch review fixes: `feature/521_final` (handoff `tickets/final.md`, choices GAPS "Final review").
- The v13 core and conformance pointers in `../429/02-v13-core.md` still hold for a `custom` jison port; re-check line numbers before relying on them.

## Wave 3

Block #521, c4 #522 and agentflow #523 run in parallel on AI-Max: at most one ticket agent at a time per port, `pnpm check` / `pnpm e2e` / push under `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock` with `VITEST_MAX_WORKERS=4`. Block's T0 (#552) is the shared core change c4 and agentflow wait for. Shared lists conflict (registry, detectors, `SECTION_OWNERS`, `HARVESTS`, `JISON_TYPES`, knip, theme vocabulary lists, adapter regex, language goldens' `empty.out`, licence tables, MIGRATION.md, RELEASING.md): when `mermaid-v13` moves, merge it, keep every side's rows, regenerate generated files, the lockfile and goldens.

## Core size (R-PERF-8, D546: 98,304 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (521fb76ee) | 93,891 | — |
| T0 #552 | 94,217 | +326 |
| base of T5 (`feature/521_block` b9f104d0d, after the `mermaid-v13` merges) | 94,412 | +195 |
| T5 #558 (registry, detector and facet rows) | 94,429 | +17 |

## Resumed (2026-11-10)

- #637 move done on `feature/521_block` (ae43c85ae, local): block's rows in its own files. Integration is not pushed until T5 adds the manifest (coordinator; #640 fixes `tools/workspace/sync.spec.ts` for pre-manifest packages).
- T3 #555 merged (ff e7fef7bd3): exact v12 sizing to four nesting levels, linear (depth 800 with spans 7.7 ms, 16k spanning blocks 43 ms).
- T4 #556 merged (ff 3c3553fc4).
- T6 #557 done on `feature/557_block_language` (handoff `tickets/557.md`), not merged yet.
