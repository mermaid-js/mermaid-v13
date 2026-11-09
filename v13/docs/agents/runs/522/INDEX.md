# Run notes, spec #522 (M5b c4, `@mermaid-js/diagram-c4`)

Integration branch `feature/522_c4` (from `mermaid-v13` at 521fb76ee). Draft PR: #622.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus | #538 | #285 (merged) | merged (ff d0ab7516e; package entry 4,328 B gz, no core change) |
| T2 grammar, parser, model, AST | #539 | #538 | merged (ff 16fe73e5f; package entry 10,923 B gz at first handoff, no core change; 89 c4 divergences) |
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

## PAUSED (2026-11-09, maintainer's decision: AI-Max overloaded)

Resume only on the wave coordinator's "RESUME". Exact resume point:

- **First step after RESUME:** merge `mermaid-v13` (it has #637, 18b902dcb, "make adding a diagram port conflict-free") into `feature/522_c4`, following `v13/docs/agents/port-diagram/shared-files.md`, section "Moving an in-flight port":
  1. Take theirs for every conflicted shared or generated file.
  2. Move c4's rows into its own files: `workspace.yaml`, `conformance/src/c4/{suite,tables}.ts`, `divergences/c4.json`, `migration/c4.md`, `hand-drawn.txt`, and the grammar `.mmd` files.
  3. Run `pnpm regen` and the two spec updates that section names.

  Then T3's branch (`feature/540_c4-layout`) merges the result and moves its own rows the same way before its full check.

- **Integration `feature/522_c4`** (worktree `.claude/worktrees/522-c4-7e6d46`): local head 2213b8b44 plus this note's commit. That is T2 ff 16fe73e5f, then `mermaid-v13` e1e953abc merged in. **Unpushed:** `origin/feature/522_c4` and draft PR #622 are at 8bc2fc5f2 (CI green there). The push of 2213b8b44 was stopped while it waited on slot A, before its pre-push `pnpm check` ran. Next: `git fetch` and merge `origin/mermaid-v13` again if it moved, `pnpm install`, then push under slot A (the pre-push hook runs the full check).
- **T3 #540** (worktree `.claude/worktrees/t540`, branch `feature/540_c4-layout`): head 90e339620 (`wip(c4): #540 handoff notes`) on e90415bb9 (the T3 commit), based on 2213b8b44. Done: `layoutC4` (Pele grid with v12 lengths, router, label placement), invariants in `./testing`, layout/literal/stress specs, Pele licence credits, `'c4'` in core `fontFamily.usedBy` (core 94,412 B gz before and after), GAPS T3, `tickets/540.md`. Last green: scoped checks (25 files, 421 passed, 44 skipped), `tsc` on diagram-c4/conformance/core/gen-config/release, eslint on the changed files. **Left:** the full `pnpm check` under the lock (the ticket touches core and tools), stopped before it finished; then the coordinator's handoff checks, `/code-review` and the ff merge.
- **Not started:** T4 #541 (unblocked by block T0 #589, already merged in), T6 #543 (unblocked by T2), T5 #542, T7 #545. One ticket agent at a time.

## Merge order (coordinator)

Wave 3 runs block #521, c4 #522 and agentflow #523 on AI-Max. Block's T0 (shape-geometry rows into core) merges into `mermaid-v13` before c4's T4. Merge `mermaid-v13` into this branch as it moves, keeping every side's rows; regenerate generated files, the lockfile and goldens rather than hand-merging.

## Core size (R-PERF-8, D546: 98,304 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (521fb76ee) | 93,891 B (`measureCoreSize`, static) | — (4,413 B spare) |
| #538 T1 | 93,891 B | 0 (no core change) |
| #539 T2 | 93,891 B | 0 (no core change) |

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
