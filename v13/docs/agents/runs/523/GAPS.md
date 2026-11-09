# Gaps (spec #523)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #544 T1 lexer and corpus
- Closed: comments and `}` blanks. The package builds its own view (`src/parser/source.ts`, no core change): directives cut, `;` drops read with comments kept, the blanks between a `}` and its line break dropped, core's tag-quote mask. `COMMENT` is a significant `T.Comment` token; a `%%` inside a label is `Kind.Comment` trivia (jison skips it). The gate's `commented()` variant adds comment lines that both sides lex as `COMMENT`; a `brace blanks` variant adds blanks after every `}`.
- Closed: post-tag specs. Every harvested string lexes as 12.2.0 does (`LINK_ID` is 12.2.0's; `shapes.ts` is not the lexer), so no lexer exclusion; `[/…/]` (D462) differs only in the model (#546).

## #546 T2 parser
- From #544: v12 parsed the comment-free text when `withComments` exceeded `maxTextSize` (with a `log.warn`); `agentflowSourceView` always keeps comments, so the parser decides that fallback.
- From #544: `agentflow-beta %% c` is a lexical error in v12 (the `dir` state has no comment rule); a top-level `%% direction LR` lexes as `direction_lr` (the `.*direction` rules run first).
- From exploration: v13 flowchart's model differs from v12 agentflow in three places to cut: subgraph parent is last-write-wins with no cycle cut (`nesting.ts:32–35`; D461 wants the cycle cut and `CONTAINMENT_VIOLATION`); `inheritDir` also falls back to the top-level `direction` in v12 (`agentflowDb.ts:1218`), though a top-level `direction` does not change the diagram direction; v12 keeps a dangling edge from `connectors --> b` after dropping the vertex.

## #547 T3 layout
- From exploration: v13 flowchart drops an authored `x --> x` whose `x` is inside a collapsed flow (`prepare.ts:335`); v12 agentflow keeps an authored self-loop.

## #548 T4 renderer
- Unblocked: block's shape-geometry T0 (#589) is merged into `mermaid-v13` (ad3648a91) and into this branch (ce62f350c). The `subroutinePadding*`, `leanPadding*` and `crossArrowhead*` rows are core rows (`packages/core/src/theme/vocabulary.ts`, values in `specs/geometry.ts`); add `'agentflow'` to the `usedBy` of each row agentflow's sources read, and nothing else in core.

## #549 T6 language facet

## #550 T5 integration

## #551 T7 ASCII (optional)
