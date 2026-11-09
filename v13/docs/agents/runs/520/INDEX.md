# Run notes, spec #520 (M5b requirement, `@mermaid-js/diagram-requirement`)

Integration branch `feature/520_requirement` (from `mermaid-v13` at 521fb76ee). Draft PR: #629.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus | #560 | #285 (merged) | merged (ff 6062cd372; package entry 4,471 B gz; core unchanged 93,891 B) |
| T2 grammar, parser, model, AST | #564 | #560 | merged (ff d0e481371; package entry ~12.5 kB gz; no core change) |
| T3 layout | #570 | #564 | merged (ff ddc255f6d; package entry 14,430 B gz; core 94,385 B unchanged, `TEXT_USERS` metadata only) |
| T4 SVG renderer | #574 | #570 | merged (ff a1d1ce0dd; package entry ~18.7 kB gz; core 94,410 B gz) |
| T6 language facet | #579 | #564 | merged (ff 540078f92; `./language` 17,030 B gz core external; 50k cycle 11.4 ms) |
| T5 integration | #587 | #574, #579 | in progress (t587) |
| T7 ASCII renderer (optional, D320) | #588 | #587 | open |

No T0 and no core change (spec). One ticket agent at a time (seven ports share AI-Max).

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.

- `01-v12-requirement.md`: pointer notes on v12's jison grammar, DB, renderer, box shape and markers, styles, config schema, theme variables, specs and syntax page, and the e2e corpus.
- `02-v13-core.md`: pointer notes on the plugin contract, ER as the worked graph-type example, the jison oracle and parity wiring, gen:grammar, the SVG writer, config, registry, theme table, size gates, the language facet, ASCII, MIGRATION.md.
- `IMPLEMENTER.md`, `GAPS.md`, `tickets/`: as in other runs.
