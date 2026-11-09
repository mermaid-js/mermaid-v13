# Run notes, spec #526 (M5b railroad, `@mermaid-js/diagram-railroad`)

Integration branch `feature/526_railroad` (from `mermaid-v13` at 521fb76ee, then ad3648a91). Draft PR: not yet open.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T0 `gen:grammar` for several grammars | #605 | — | merged into `mermaid-v13` (#621, c66d9ab1a) |
| T1 lexer parity gates | #608 | #605 | merged (ff ed0e4aa7c; `./testing` 4,674 B gz, runtime entry 20 B; no core change) |
| T2 grammars, parsers, model, AST | #610 | #608 | open |
| T3 layout | #612 | #610 | open |
| T4 renderer and theme table | #613 | #612 | open |
| T6 language facet | #616 | #610 | open |
| T5 integration | #615 | #613, #616 | open |
| T7 ascii (optional, D518) | #617 | #615 | open |

- `01-v12-railroad.md`: pointer notes on v12's four Langium grammars, DB, renderer, styles, specs, docs, corpus and the oracle.
- `02-v13-core.md`: pointer notes on the plugin contract, `custom` ports, conformance wiring, core seams.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Wave 4

architecture, railroad, eventmodeling and swimlane run in parallel with wave 3 on shared machines: at most one ticket agent at a time here. Shared lists conflict (registry, detectors, `SECTION_OWNERS`, `HARVESTS`, `LANGIUM_LEXERS`, knip, theme vocabulary lists, adapter regex, `empty.out`, licence tables, MIGRATION.md, RELEASING.md): when `mermaid-v13` moves, merge it, keep every side's rows, regenerate generated files, the lockfile and goldens.

## Core size (R-PERF-8, D546 limit 98,304 B gz, `measureCoreSize`)

| After | Core gz | Δ |
| --- | --- | --- |
| base `mermaid-v13` @ 521fb76 | 93,891 | — |
| base `mermaid-v13` @ ad3648a (#589) | 94,217 | +326 (not ours) |
| base `mermaid-v13` @ ade398e (#620) | 94,352 | +135 (not ours) |
