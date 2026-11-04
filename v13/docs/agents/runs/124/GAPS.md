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

## #132 T3 layout (merged)

- No unmet criteria. Fixed at merge: `grammar/generated/*` was gitignored and never committed, so `check:grammar` failed in fresh worktrees (the flaky push after #131). Now force-added, as flowchart's are.
- Core `layered` gap, not in the corpus, flowchart has it too: an edge from a group to its own member puts the label on the member (`G ||--|| A`, A in G), and a group self-loop runs outside the drawing. Belongs to a core ticket, not this spec.

## #134 T5 integration (open items)

- Generate the ER section defaults (`SECTION_OWNERS`; v12 nodeSpacing 140, rankSpacing 80, minEntityWidth 100) and mark the keys the builder reads (`er.nodeSpacing`, `er.rankSpacing`, `er.minEntityWidth`) as honoured.
- **D116 (maintainer, draft PR #184): honour both.** Mark `er.entityPadding` (default 15) and `er.diagramPadding` (default 20) `honoured`. In px, `entityPadding` replaces the shared node padding inside entity table cells (v12's across × down meaning) and `diagramPadding` sets the margin around the drawing; the cell profile stays at 1-cell padding. Fix the MIGRATION.md ER row that says they are ignored, and cite D116 in code and tests.

## Not started

- #133 T4 renderer, #136 T7 ASCII: unblocked by T3; #135 T6 running.
- #134 T5 integration: downstream of T4.
