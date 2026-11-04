# Run notes, spec #125 (sequence)

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #137 | — | merged |
| T2 grammar, parser, model, AST | #139 | #137, #27, #28 | running |
| T3 custom layout | #141 | soft: #139 | merged (parser-fixture criterion open) |
| T4 SVG renderer | #143 | #139, #141 | — |
| T5 integration | #145 | #143 | — |
| Actor menus (plugin-interactions) | #147 | #143; never with class's interactions ticket (D112) | — |
| T6 language facet | #149 | #139, #29, #31 | — |
| T7 ASCII | #150 | #139, #141 | — |

- `01-v12-sequence.md`: pointer notes on v12 grammar, DB, renderer, specs, corpus.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria per ticket.
- `tickets/<n>.md`: handoffs.

## Finish rule (maintainer)

PR #164 stays a draft until all of these hold; then `gh pr ready 164 -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above is merged into `feature/125_sequence-diagram`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check`, the full e2e suite and the bench run pass locally, under the locks.
4. GAPS.md has nothing unmet, apart from items the maintainer accepted.
5. The PR description carries these results and the bench load-path size (D110).
The same report lists the `gh issue close` commands for the tickets.
