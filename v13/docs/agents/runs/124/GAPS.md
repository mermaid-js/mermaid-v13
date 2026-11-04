# GAPS: spec #124 (ER diagram port)

Unmet acceptance criteria and open contracts, under the ticket that owns each one.

## #130 T1 lexer gate (merged)

- No unmet criteria. 4 of 2,599 sources are not compared: commented variants whose mid-line cut splits the `erDiagram` keyword, so v12 never detects them (listed in `packages/conformance/src/er/lexer-parity.spec.ts`).
- Final `/code-review` over the lexer is deferred to the spec's finish step.

## Blocked (not started)

- #131 T2 grammar/parser/model: blocked by M2.5 #27 (parser-kit probe) and #28 (category table), not merged into `mermaid-v13` on 2026-11-04 (D107). Held, per the run brief.
- #132 T3 layout: may start on hand-built fixtures, but its done criterion needs parser-produced fixtures, and `ErModel` is T2's contract. Not started, to avoid defining the model ahead of T2.
- #133 T4 renderer, #134 T5 integration, #136 T7 ASCII: downstream of T3.
- #135 T6 language facet: blocked by T2, #29 and #31.
