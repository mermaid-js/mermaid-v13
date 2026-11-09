# Run notes, spec #429 (M5a venn, `@mermaid-js/diagram-venn`)

Integration branch `feature/429_venn` (from `mermaid-v13` at 12ba676cb). Draft PR: #533.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #486 | #285 (merged) | merged (ff d614349d7; package entry 3,043 B gz, no core change) |
| T2 grammar, parser, model, AST | #488 | #486 | merged (ff 6af3622b5; package entry 8,334 B gz, no core change) |
| T3 layout and venn.js solver | #491 | #488 | merged (ff f95271949; package entry 16,410 B gz, core 93,426 B gz unchanged) |
| T4 SVG renderer and theme table | #495 | #491 | merged (ff 51e92a401; package entry 19,137 B gz, CDN core closure 94,095 B gz) |
| T6 language facet | #498 | #488 | merged (ff b74e4ae02; package entry 19,965 B gz, `./language` 12,329 B gz) |
| T5 integration | #501 | #495, #498 | merged (ff a0505085c; CDN core closure 94,132 B gz, 76 B headroom; warm render 9.8× geomean vs 12.2.0) |

No T7 (D320: `format: 'ascii'` throws `UnsupportedFormatError`).

- `01-v12-venn.md`: pointer notes on v12 grammar, DB, renderer, specs, docs page, venn.js 2.0.0, corpus.
- `02-v13-core.md`: pointer notes on the plugin contract, `custom` ports, conformance wiring, core seams.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Wave 2

xychart #426, sankey #427, treemap #428, venn #429 and wardley #430 run in parallel on one machine: at most one ticket agent at a time here. Shared lists conflict (registry, detector, `HARVESTS`, knip, theme vocabulary lists, adapter regex, MIGRATION.md, RELEASING.md): when `mermaid-v13` moves, merge it, keep every side's rows, regenerate generated files and goldens.

## Core size (R-PERF-8, CDN limit 94,208 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (12ba676cb) | — | — |
| #486 T1 | unchanged | 0 (no core or registry change) |
| #488 T2 | unchanged | 0 (no core or registry change) |
| #491 T3 | 93,426 | 0 (schema `venn.padding` default 8 → 15 and its doc comment only) |
| #495 T4 | bench 93,682 → 93,695; CDN closure 94,088 → 94,095 | +7 (`data-venn-sets` in the SVG allowlist; the bench base includes #534) |
| #498 T6 | 93,695 | 0 (`LanguageFacet.quoteId` is type-only) |
| #501 T5 | bench 93,695 → 93,746; CDN closure 94,094 → 94,132 | +51 bench / +38 CDN (registry row, detector, config keys) |

## Merge log

- 2026-11-08: `mermaid-v13` 0a472e044 (#482, core `cScale`/git palette derivation, D544) merged in 1d9ca69b7, clean. The brief still says not to depend on it for venn's palette rows.
- 2026-11-08: `mermaid-v13` 98d3c3ffa (#515 keepWords, #524 sankey core T0, #530 M5b decisions, #531 packet stress timer) merged in ab81ad803, clean.
- 2026-11-08: `mermaid-v13` 05a786ad8 (#534 xychart core T0: shared chart series palette, D381, D545) merged in 493da7fcd, clean.
- 2026-11-09: `mermaid-v13` f31a8b181 (treemap #516, wardley #529, xychart #535, sankey #532, D546) merged on `feature/429_venn-merge`: 54 conflicted files, every side's rows kept; `licenses.ts` takes sankey/treemap's per-license shape with venn's holder and copyright lists, venn.js and fmin added to `REQUIRED_CREDITS` and mermaid's `BUNDLED_CREDITS` (mermaid's notices gain both sections); `language.ts`/`symbols.ts` are `mermaid-v13`'s; generated files, lockfile, goldens and the yaml-tree digest regenerated. `pnpm check` 899 files, 18,589 tests; core 93,891 B gz (limit 98,304), CDN closure 94,007 B gz.

## Final review

Whole-branch `/code-review` (standards and spec) at efc8e6f20: no blocking spec gap; 15 findings fixed in 8a2c37cf6 (`tickets/final.md`). `pnpm check` 776 files, 16,806 tests; `pnpm e2e` 2,423 passed; core unchanged (CDN closure 94,132 B gz).

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
