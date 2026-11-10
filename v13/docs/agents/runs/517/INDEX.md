# Run notes, spec #517 (M5b usecase, `@mermaid-js/diagram-usecase`)

Integration branch `feature/517_usecase` (from `mermaid-v13` at 521fb76ee). Draft PR: #624.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 core rows + `slot()` | #561 | — | merged into `mermaid-v13` as #620 (ade398e6b) |
| T1 lexer parity gate | #562 | — | merged (a37507281; `./testing` 4.9 KB gz, no core change) |
| T2 grammar, parser, model, AST | #563 | #562 | merged (d6986472d; `.` 18.3 KB gz, no core change) |
| T3 layout | #565 | #563 | merged (81b4ac949; `.` 22.5 KB gz, no core change) |
| T4 SVG renderer and theme table | #566 | #565, #561 | merged (ff 3444cda86; `.` 30.4 KB gz, core usedBy only) |
| T5 integration | #567 | #561, #566 | merged (ff 79e171be6; chunk 35,451 B gz, load path 129,881 B gz) |
| T6 language facet | #568 | #563 | merged (ff 4e7b9c1ea; `./language` 25.1 KB gz; registry wiring in T5) |
| T7 ASCII (Should) | #569 | #565, #567 | merged (ff 892119ee6; text path 10,272 B gz) |

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
| #563 T2 | unchanged | 0 (no core or registry change) |
| #565 T3 | unchanged | 0 (no core or registry change) |
| #566 T4 | 94,412 → 94,412 | 0 (core `usedBy` lists only, dropped from the bundle) |
| #567 T5 | 94,412 → 94,430 | +18 (registry row, detector, config keys) |
| #569 T7 | 94,430 → 94,444 | +14 (`ascii` in `formats`) |
| final review | 94,444 → 94,444 | 0 (schema reason text and the usecase package only; load path 131,302 → 131,557, text path 10,307 → 10,893) |

## Merge log

- 2026-11-10: final whole-branch review (two axes) fixed on `feature/517_usecase-final-fixes`, fast-forwarded (c332fd7ab): note placement on boundary members, config read once, cell sizing behind `./ascii`, markers on edge views, dead exports. Full check 19,450 tests, e2e 2,691. `mermaid-v13` 58ddf094e (CI timeout 40 min) merged in, clean.

- 2026-11-10: `feature/569_usecase-ascii` fast-forwarded (892119ee6): lazily loaded `./ascii`, D478 shapes, both charsets. Full check 19,441 tests. Hosted CI on adb9a2b7d green after one rerun of a `packages/dev/src/watch.spec.ts` 5 s timeout.

- 2026-11-10: `feature/567_usecase-integration` fast-forwarded (79e171be6): manifest, regen, config honoured, baselines, migration notes. Full check 19,411 tests, e2e 2,690 passed, warm render 49.2× geomean vs 12.2.0.

- 2026-11-10: `feature/568_usecase-language` fast-forwarded (4e7b9c1ea, after review: no hidden facet import, one keyword table, lexer slow path as slices). The language-service goldens fail until T5's manifest; the branch is not pushed between T6 and T5.

- 2026-11-09: `mermaid-v13` 1a78e25d7 (#637 conflict-free ports, #638 pre-manifest packages) merged in, with the move: parity suite and harvest row to `conformance/src/usecase/{suite,tables}.ts`, divergences to `divergences/usecase.json`, grammar target to `diagram-usecase/workspace.yaml` (no `theme:` keys: the scan finds 17 core reads, `actorBkg`/`actorBorder` through `slot()`), MIGRATION section to `migration/usecase.md`; core `usedBy` back to `mermaid-v13`'s (readers come from the scan). Shared code merged: T4's `slot()` read in `themeReads`, the harvest folder-in-name change, and `sync.spec.ts` copying pre-manifest packages.

- 2026-11-09: `feature/566_usecase-render` fast-forwarded (3444cda86, after a two-axis review: plain labels escaped as v12, kind narrowing, `slot()` direction check). #637's migration was merged and dropped on the coordinator's hold (never pushed); it waits for the shared `tools/workspace/diagrams.ts` fix.

- 2026-11-09: `feature/565_usecase-layout` merged (81b4ac949, after a two-axis review: clip.ts source-axis bug and edge cases, note rank adjacency, duplication). `mermaid-v13` unchanged since e1e953abc.

- 2026-11-09: `feature/563_usecase-parser` merged (d6986472d, after a two-axis review: nine fixes, incl. pitfall 10 parts objects, kit recovery, D476 tests ported without `getAST()`). `mermaid-v13` e1e953abc (compass #630, swimlane engine #628) merged in, clean.

- 2026-11-09: `feature/562_usecase-lexer` merged (a37507281, after a two-axis review: eight small fixes). `mermaid-v13` f71e9a58b (block T0 #589, usecase T0 #620, …) merged in 6f2952b08, clean; `theme-used-by.spec.ts` gains `LISTED_AHEAD` (usecase on `actorBkg`/`actorBorder` before its renderer reads them).

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
