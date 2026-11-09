# Gaps (spec #523)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #544 T1 lexer and corpus
- From exploration: v12 agentflow lexes `%%` lines as `COMMENT` tokens and keeps leading blank lines, while core `sourceView` cuts comments out and its `braceNewline` collapses `}\s*\n` where agentflow collapses only `}[^\S\n]*\n` (01 §1, 02 §1). Flowchart's `commented()` variant does not apply as is; decide the gate variant and the view option (prefer a package-local view over a core change).
- From exploration: `fa796a943` is past 12.2.0 for `shapes.ts` (the `lean_right` alias fix) and flowchart's `LINK_ID`; the harvest reads post-tag specs. Exclude or skip what 12.2.0 rejects, with a reason.

## #546 T2 parser
- From the #544 review: D467's test-only parity spec (v12's flowchart `SHARED_SYNTAX` bodies fed to both v13 flowchart and agentflow) is this ticket's.
- From exploration: v13 flowchart's model differs from v12 agentflow in three places to cut: subgraph parent is last-write-wins with no cycle cut (`nesting.ts:32–35`; D461 wants the cycle cut and `CONTAINMENT_VIOLATION`); `inheritDir` also falls back to the top-level `direction` in v12 (`agentflowDb.ts:1218`), though a top-level `direction` does not change the diagram direction; v12 keeps a dangling edge from `connectors --> b` after dropping the vertex.

## #547 T3 layout
- From exploration: v13 flowchart drops an authored `x --> x` whose `x` is inside a collapsed flow (`prepare.ts:335`); v12 agentflow keeps an authored self-loop.

## #548 T4 renderer
- Unblocked: block's shape-geometry T0 (#589) is merged into `mermaid-v13` (ad3648a91) and into this branch (ce62f350c). The `subroutinePadding*`, `leanPadding*` and `crossArrowhead*` rows are core rows (`packages/core/src/theme/vocabulary.ts`, values in `specs/geometry.ts`); add `'agentflow'` to the `usedBy` of each row agentflow's sources read, and nothing else in core.

## #549 T6 language facet

## #550 T5 integration

## #551 T7 ASCII (optional)
