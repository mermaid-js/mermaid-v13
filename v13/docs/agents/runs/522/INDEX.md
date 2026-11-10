# Run notes, spec #522 (M5b c4, `@mermaid-js/diagram-c4`)

Integration branch `feature/522_c4` (from `mermaid-v13` at 521fb76ee). Draft PR: #622.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus | #538 | #285 (merged) | merged (ff d0ab7516e; package entry 4,328 B gz, no core change) |
| T2 grammar, parser, model, AST | #539 | #538 | merged (ff 16fe73e5f; package entry 10,923 B gz at first handoff, no core change; 89 c4 divergences) |
| T3 layout (grid and relation router) | #540 | #539 | merged (ff ed053f58b; package entry 21,446 B gz; core unchanged) |
| T4 SVG renderer | #541 | #540; block's T0 (#521, PR #589) merged into `mermaid-v13` | merged (ff 5f5344bfe; package entry 25,234 B gz; core unchanged) |
| T5 integration | #542 | #541, #543 | merged (ff f767d4b3e; core 94,434 B gz, +22 registry row; load path 125,322 B; warm-render geomean 31.2× vs 12.2.0, not a steady machine) |
| T6 language facet | #543 | #539 | merged (ff bc3c97782; package entry 26,244 B gz, `./language` 18,312 B gz core external; core unchanged) |
| T7 ascii (Should) | #545 | #542 | merged (ff a3f71747a; text path 12,288 B gz; core +12, the `loadAscii` row) |

- `01-v12-c4.md`: pointer notes on v12 grammar, DB, renderer, shapes, specs, config, corpus, Pele.
- `02-v13-core.md`: pointer notes on the plugin contract, `custom` ports, conformance wiring, core seams, size guards.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Resumed (2026-11-10)

- `mermaid-v13` 58ddf094e merged in (e1bb4396e) and c4's rows moved into its own files per #637 (89d8f1870). **Kept local until T5 adds the manifest** (coordinator's rule; #640 fixes two pre-manifest gaps). Until #640 merges, `pnpm check` fails only `tools/workspace/sync.spec.ts` > "take a new diagram package from its own folder alone". If #640 is merged when we push, take theirs for `tools/workspace/sync.spec.ts`.
- T3 #540 resumes at 90e339620: merge `feature/522_c4`, move its licence credits to `workspace.yaml` `credits:` plus `notices/mermaid.txt`, drop the core `fontFamily.usedBy` edit, then the checks.

## Merge order (coordinator)

Wave 3 runs block #521, c4 #522 and agentflow #523 on AI-Max. Block's T0 (shape-geometry rows into core) merges into `mermaid-v13` before c4's T4. Merge `mermaid-v13` into this branch as it moves, keeping every side's rows; regenerate generated files, the lockfile and goldens rather than hand-merging.

## Core size (R-PERF-8, D546: 98,304 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (521fb76ee) | 93,891 B (`measureCoreSize`, static) | — (4,413 B spare) |
| #538 T1 | 93,891 B | 0 (no core change) |
| #539 T2 | 93,891 B | 0 (no core change) |
| `mermaid-v13` 58ddf094e (#637 move) | 94,412 B | +521 (mermaid-v13's own growth) |
| #540 T3 | 94,412 B | 0 (no core change) |
| #541 T4 | 94,412 B | 0 (no core change) |
| #543 T6 | 94,412 B | 0 (no core change) |
| #542 T5 | 94,434 B | +22 (registry row) |
| #545 T7 | +12 | the `loadAscii` row |
| final (e1709e6e6, after `mermaid-v13` 8b336e2b0) | 96,020 B | c4's own share +34 B; the rest is other ports in `mermaid-v13`; 2,284 B under the 98,304 gate |

## Final state (2026-11-10)

- Final whole-branch review (standards and spec) fixed on `feature/522_c4-final-review` (ff ddd3d2505); see `tickets/final-review.md`.
- `mermaid-v13` 8b336e2b0 (block #623, requirement #629, usecase, treeView, ishikawa) merged in e1709e6e6: generated files taken from theirs and regenerated, `v13/docs/ascii.md` merged by hand (both the C4 and block sections).
- Scoped checks at e1709e6e6: 45 files, 1,545 tests passed, 44 skipped; `tsc` clean on diagram-c4, conformance, mermaid, bench, language-service; eslint clean on every changed file; `check:config`, `check:grammar`, `check:licenses`, `check:deps` pass. Pushed with `--no-verify` per the maintainer's 2026-11-10 rule; hosted CI is the full gate.

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
