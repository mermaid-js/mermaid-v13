# Run notes, spec #523 (M5b agentflow, `@mermaid-js/diagram-agentflow`)

Integration branch `feature/523_agentflow` (from `mermaid-v13` at 521fb76ee). Draft PR: #632.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus | #544 | #285 (merged) | merged (no-ff, head 047a81af7; main entry 7,778 B gz, core untouched) |
| T2 grammar, parser, model, AST | #546 | #544 | open |
| T3 layout | #547 | #546 | open |
| T4 SVG renderer | #548 | #547, block's shape-geometry T0 (#521) | open |
| T6 language facet | #549 | #546 | open |
| T5 integration | #550 | #548, #549 | open |
| T7 ASCII renderer (optional, D320) | #551 | #550 | open |

Core size at the base: 93,891 B gz (`measureCoreSize`, gate 98,304 B, D546). One ticket agent at a time (three ports share AI-Max).

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.

- `01-v12-agentflow.md`: pointer notes on v12's jison grammar (diff against flowchart), DB, diagnostics, shapes, colour slots, renderer, config schema, specs, in-tree fixtures, the e2e corpus.
- `02-v13-seams.md`: pointer notes on what the port plugs into: flowchart's parser, layout, shapes and facet, the jison oracle and parity wiring, gen:grammar, registry, config, theme, size gates.
- `IMPLEMENTER.md`, `GAPS.md`, `tickets/`: as in other runs.
