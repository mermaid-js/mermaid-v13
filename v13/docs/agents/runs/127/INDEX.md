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
| #142 | T2 grammar, parser, model, AST | #138, #162, #27, #28 (D107) |
| #144 | T3 layout | #142, #140 (+ a state T0 if #140 calls for one) |
| #146 | T4 renderer | #144 |
| #148 | T5 integration | #146 |
| #151 | T6 language facet | #142, #29, #31 (D107) |

No ASCII ticket (D100). At most two tickets run at a time (D112).
