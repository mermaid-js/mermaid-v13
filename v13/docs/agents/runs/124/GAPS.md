# GAPS: spec #124 (ER diagram port)

Unmet acceptance criteria and open contracts, under the ticket that owns each one.

## #130 T1 lexer gate (merged)

- No unmet criteria. 4 of 2,599 sources are not compared: commented variants whose mid-line cut splits the `erDiagram` keyword, so v12 never detects them (listed in `packages/conformance/src/er/lexer-parity.spec.ts`).
- Final `/code-review` over the lexer is deferred to the spec's finish step.

## #131 T2 grammar/parser/model (merged)

- No unmet criteria. D114 closed: diagram-er reads core's `sourceView` through `src/parser/view.ts`; its own `source.ts` is deleted, lexer parity still 100%.
- For T6: probe-mode `mode` is always `''` (the ER lexer does not report its state yet).
- Known limit: after an error, a stray `{` opens an attribute block in the lexer, so recovery skips to the next `}`.
- Not ported, with reasons in the port script: `erDb.spec.js` (calls the DB directly, no parse) and `erRenderer.spec.ts` (T4 territory).

## Not started

- #133 T4 renderer, #136 T7 ASCII: downstream of T3 (#132, running).
- #134 T5 integration: downstream of T4.
