# Run notes, spec #426 (M5a XY chart, `@mermaid-js/diagram-xychart`)

Integration branch `feature/426_xychart` (from `mermaid-v13` at 12ba676cb). Draft PR: #535.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 shared chart series palette (D381) + table palette kind (D545) | #506 | — | merged into `mermaid-v13` as #534 (05a786ad8; D545 confirmed), merged here at 898863a24 |
| T1 lexer parity gate | #507 | #285 (merged) | merged (ff 1f7574f8c; package entry 4,193 B gz, no core change) |
| T2 grammar, parser, model, AST | #508 | #507 | merged (ff 2d29b39c6; package entry 9,064 B gz, no core change) |
| T3 layout | #509 | #508 | merged (ff 58a69c2c6; package entry ~15 KB gz; core +0, `fontFamily` usedBy only) |
| T4 SVG renderer and theme table | #510 | #509, #506 | merged (c2f0d523f; package entry 17,928 B gz; theme identity 0 diffs) |
| T6 language facet | #512 | #508 | merged (ff e7da02591; `./language` 12,470 B gz; core +0, type-only `LanguageFacet.writtenName?`) |
| T5 integration | #513 | #510, #512 | merged (ff c2b31d376; package entry 18,230 B gz; warm render 16.7× v12) |

No T7 (D320: xychart throws `UnsupportedFormatError` for `ascii`).

- `01-v12-xychart.md`: pointer notes on v12 grammar, DB, chart builder, renderer, config, theme blocks, specs, corpus, Pele.
- `02-v13-core.md`: pointer notes on the plugin contract, `custom` ports to copy, conformance wiring, theme table and shared palette, size gates, shared files.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Order

AI-Max is shared by five wave-2 ports, so one ticket agent runs at a time: T1 → T0 (its own PR into `mermaid-v13`, merged here once it lands or before T4) → T2 → T3 → T6 → T4 → T5. Merge `mermaid-v13` into this branch as it moves, keeping every side's rows; regenerate generated files and goldens rather than hand-merging.

## Core size (R-PERF-8, CDN limit 94,208 B gz)

| After | Core gz | Δ |
| --- | --- | --- |
| base (12ba676cb) | 91,974 B (CDN, `measureCoreSize`) | — (2,234 B spare) |
| #507 T1 | 91,974 B | 0 (no core change) |
| `mermaid-v13` 7623406a4 merged (sankey T0 #524, #515) | 93,822 B (`cdn-build.spec.ts` ESM closure) | +1,848 from other PRs; 386 B spare |
| #506 T0 (#534, merged; measured on 98d3c3ffa) | 94,088 B | +266; 120 B spare |
| #508 T2 | — | 0 (no core or registry change) |
| #509 T3 | 94,088 B | 0 (`fontFamily` usedBy += xychart; dropped from CDN core) |
| #510 T4 | 94,096 B | +8 (`flatten()` treats a flat `[]` as unset, D545 fix; 112 B spare) |
| #513 T5 | 94,121 B | +23 (`configSection` seam as #497, registry row, `$ref` key; 87 B spare) |

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
