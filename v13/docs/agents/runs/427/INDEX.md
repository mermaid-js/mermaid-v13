# Run notes, spec #427 (M5a sankey, `@mermaid-js/diagram-sankey`)

Integration branch `feature/427_sankey` (from `mermaid-v13` at 12ba676cb). Draft PR: #532.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 core gradients and blend mode (own PR #524 into `mermaid-v13`) | #492 | — | merged into `mermaid-v13` (7623406a4); merged here in 9b295d408 |
| T1 lexer parity gate and corpus | #494 | #285 (merged) | merged (ff e14f2e3af; `./testing` 2,134 B gz, main entry 29 B, no core change) |
| T2 grammar, parser, model, AST | #496 | #494 | merged (ff bde56c3e4; main entry 5,936 B gz, no core change) |
| T3 layout | #499 | #496 | merged (ff de3cbda74; main entry 9,167 B gz, core unchanged 93,682 B) |
| T4 SVG renderer | #502 | #499, #492 | pending |
| T6 language facet | #504 | #496 | pending |
| T5 integration | #503 | #502, #504 | pending |

No T7 (D320: sankey throws `UnsupportedFormatError` for ascii). One ticket agent at a time (five ports share AI-Max).

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.

- `01-v12-sankey.md`: pointer notes on v12's jison grammar, preprocessing and oracle capture, probed oracle quirks, DB, renderer, styles, config schema, d3-sankey 0.12.3, Tableau10, the v12 spec and harvest, the e2e corpus.
- `02-v13-core.md`: pointer notes on the plugin contract, `custom` ports (pie, radar, packet, kanban, info), the jison oracle and parity wiring, gen:grammar, the SVG writer (gradient, style allow-list, `assertInert`, ids, `data-ast`), config, registry, theme, size gates, measuring, the language facet, MIGRATION.md.
- `IMPLEMENTER.md`, `GAPS.md`, `tickets/`: as in other runs.
