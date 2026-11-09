# Run notes, spec #520 (M5b requirement, `@mermaid-js/diagram-requirement`)

Integration branch `feature/520_requirement` (from `mermaid-v13` at 521fb76ee). Draft PR: not yet opened.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus | #560 | #285 (merged) | open |
| T2 grammar, parser, model, AST | #564 | #560 | open |
| T3 layout | #570 | #564 | open |
| T4 SVG renderer | #574 | #570 | open |
| T6 language facet | #579 | #564 | open |
| T5 integration | #587 | #574, #579 | open |
| T7 ASCII renderer (optional, D320) | #588 | #587 | open |

No T0 and no core change (spec). One ticket agent at a time (seven ports share AI-Max).

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.

- `01-v12-requirement.md`: pointer notes on v12's jison grammar, DB, renderer, box shape and markers, styles, config schema, theme variables, specs and syntax page, and the e2e corpus.
- `02-v13-core.md`: pointer notes on the plugin contract, ER as the worked graph-type example, the jison oracle and parity wiring, gen:grammar, the SVG writer, config, registry, theme table, size gates, the language facet, ASCII, MIGRATION.md.
- `IMPLEMENTER.md`, `GAPS.md`, `tickets/`: as in other runs.
