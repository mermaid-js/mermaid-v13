# Run notes, spec #429 (M5a venn, `@mermaid-js/diagram-venn`)

Integration branch `feature/429_venn` (from `mermaid-v13` at 12ba676cb). Draft PR: none yet.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #486 | #285 (merged) | open |
| T2 grammar, parser, model, AST | #488 | #486 | open |
| T3 layout and venn.js solver | #491 | #488 | open |
| T4 SVG renderer and theme table | #495 | #491 | open |
| T6 language facet | #498 | #488 | open |
| T5 integration | #501 | #495, #498 | open |

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

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.
