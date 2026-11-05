# Run notes, spec #288 (pie)

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate, shared Langium oracle | #304 | — | merged |
| T2 grammar, parser, model, AST, ported specs | #305 | #304 | merged |
| T3 custom layout (`PieLayout`) | #335 | #305 (soft) | merged |
| T4 SVG renderer | #306 | #305, #335 | open |
| T5 integration | #325 | #306 | open |
| T6 language facet | #307 | #305 | open |

- `01-v12-pie.md`: pointer notes on v12 grammar, DB, renderer, specs, corpus, and the v13 seams.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and orchestrator choices, per ticket.
- `tickets/<n>.md`: handoffs.

## Shared contract: `loadLangiumLexerOracle` (D220)

Built by #304; gitGraph's T1 adds a descriptor (D262). Its API is recorded in `tickets/304.md` and must stay stable.

## Finish rule

The integration PR stays a draft until all of these hold; then `gh pr ready <PR> -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above is merged into `feature/288_pie`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check` and `pnpm e2e` (Playwright image) pass locally, under the locks.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gz size and the `gh issue close` commands.
