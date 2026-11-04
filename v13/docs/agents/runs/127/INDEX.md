# Run notes — spec #127 (M3 state diagram, `@mermaid-js/diagram-state`)

- IMPLEMENTER.md — the brief every implementer follows.
- GAPS.md — unmet criteria and shared contracts, by owning ticket.
- tickets/<N>.md — handoff per ticket.

Tickets (sub-issues of #127, native blocked-by links):

| # | Ticket | Blocked by |
| --- | --- | --- |
| #162 | state T0: v12 source view in the core parser kit (D114); own draft PR into `mermaid-v13` | — |
| #138 | T1 lexer parity gate | — |
| #140 | concurrency-regions prototype (D111) | — |
| #142 | T2 grammar, parser, model, AST | #138 ✓, #27 ✓, #28 ✓ (D107). The native #162 link is stale: T2 keeps its own source view until #181 merges (D114) |
| #144 | T3 layout | #142, #140 (+ a state T0 if #140 calls for one) |
| #146 | T4 renderer | #144 |
| #148 | T5 integration | #146 |
| #151 | T6 language facet | #142, #29 ✓, #31 ✓ (D107) |

No ASCII ticket (D100). At most two tickets run at a time (D112).

## Finish rule (maintainer, 2026-11-04)

#160 stays a draft while tickets land. Run `gh pr ready 160 -R mermaid-js/mermaid-v13` only when all hold:
1. Every state ticket (T1–T6, the regions prototype) is merged into `feature/127_state-diagram`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check`, the full e2e suite and the bench run pass locally, under the locks.
4. GAPS.md has nothing unmet apart from maintainer-accepted items.
5. The PR description carries these results and the bench load-path size (D110).

The same report lists the `gh issue close` commands. Never merge #160.
