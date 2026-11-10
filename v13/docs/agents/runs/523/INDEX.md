# Run notes, spec #523 (M5b agentflow, `@mermaid-js/diagram-agentflow`)

Integration branch `feature/523_agentflow` (from `mermaid-v13` at 521fb76ee). Draft PR: #632. Moved to per-type files after #637 (`workspace.yaml`, `conformance/src/agentflow/{suite,tables}.ts`, `divergences/agentflow.json`); push waits for T5's manifest (or #640), since `tools/workspace/sync.spec.ts` fails for a pre-manifest package until #640.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus | #544 | #285 (merged) | merged (no-ff, head 047a81af7; main entry 7,778 B gz, core untouched) |
| T2 grammar, parser, model, AST | #546 | #544 | merged (ff 5b739cebe; main entry 23,846 B gz before review fixes, core untouched) |
| T3 layout | #547 | #546 | merged (no-ff, head 609401fd9; main entry 28,512 B gz before review fixes; core usedBy rows dropped in the #637 move) |
| T4 SVG renderer | #548 | #547, block's shape-geometry T0 (#521) | merged (ff 4c7cabae9; main entry 34,786 B gz, core untouched) |
| T6 language facet | #549 | #546 | merged (ff 619d40c16; `./language` 30,041 B gz; carries #640's commit d6d83c2 until it merges) |
| T5 integration | #550 | #548, #549 | merged (ff e359511c6; core 94,434 B gz, +22 B registry row; load path 133,173 B; main 34,935 B, `./language` 30,244 B) |
| T7 ASCII renderer (optional, D320) | #551 | #550 | open |

Core size at the base: 93,891 B gz (`measureCoreSize`, gate 98,304 B, D546). One ticket agent at a time (three ports share AI-Max).


## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.

- `01-v12-agentflow.md`: pointer notes on v12's jison grammar (diff against flowchart), DB, diagnostics, shapes, colour slots, renderer, config schema, specs, in-tree fixtures, the e2e corpus.
- `02-v13-seams.md`: pointer notes on what the port plugs into: flowchart's parser, layout, shapes and facet, the jison oracle and parity wiring, gen:grammar, registry, config, theme, size gates.
- `IMPLEMENTER.md`, `GAPS.md`, `tickets/`: as in other runs.
