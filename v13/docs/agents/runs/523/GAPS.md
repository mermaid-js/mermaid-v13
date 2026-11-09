# Gaps (spec #523)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #544 T1 lexer and corpus
- Closed: comments and `}` blanks. The package builds its own view (`src/parser/source.ts`, no core change): directives cut, `;` drops read with comments kept, the blanks between a `}` and its line break dropped, core's tag-quote mask. `COMMENT` is a significant `T.Comment` token; a `%%` inside a label is `Kind.Comment` trivia (jison skips it). The gate's `commented()` variant adds comment lines that both sides lex as `COMMENT`; a `brace blanks` variant adds blanks after every `}`.
- Closed: post-tag specs. Every harvested string lexes as 12.2.0 does (`LINK_ID` is 12.2.0's; `shapes.ts` is not the lexer), so no lexer exclusion; `[/…/]` (D462) differs only in the model (#546).

## #546 T2 parser
- Closed: D467's `SHARED_SYNTAX` parity spec (`packages/conformance/src/agentflow/shared-syntax.spec.ts`: both v13 parsers and both v12 types agree on accept/reject, and on vertices and edges where they accept).
- Closed: `maxTextSize`. `parseAgentflow(…, { maxTextSize })` passes it to the view (default 50,000; the plugin, #550, passes `ctx.config.maxTextSize`). **Choice:** no warning: through the pipeline core's `maxSourceLength` (also `maxTextSize`) rejects a longer source first, so the fallback only shows on direct calls.
- Closed: `agentflow-beta %% c` is `HEADER_COMMENT` (one error, its own message); `%% direction LR` is a `direction` statement, as v12 read it (a flow's direction inside a flow, nothing at the top), and a comment past `maxTextSize`.
- Closed: the three flowchart-model differences. The cycle cut is in the model (`containment.ts`, `CONTAINMENT_VIOLATION` at the inner flow's opener) and gives `parent`/`collapsedInto` on vertices and flows; `inheritDir` reads the header direction, the same as v12 (its fallback to `config.direction` is unreachable: the header always sets one), pinned in `parse.spec.ts`; the edge from `connectors` stays in the model with its dangling end (T3 decides what to draw).
- Found, core's (not fixed here): core's YAML reader reads U+2028/U+2029 inside a multi-line `@{ … }` as line breaks, js-yaml as text; the gate's separator variants of 13 sources differ there (classified in `agentflow/parity.spec.ts`). Flowchart's `@{ … }` reads the same.
- Found, flowchart's (not fixed here): flowchart's in-place one-line `@{ … }` read starts at `@` + 1, so a directive between `@` and `{` reaches its YAML (agentflow starts at the opener's `{`).
- **Choice:** edge AST ids are flowchart's `e:A>B` / `#2` (D468 "follows flowchart's scheme"); `global:<n>` and `s:subGraph<n>` as D468 says.
- Closed in the #546 review: v12 read a `label` that is not text through its sanitiser's `toString` (`5`, `1,2`, `[object Object]`) and an unknown `labelType` as `markdown`; v13 keeps that model and warns `NODE_DATA_COERCED` per value (pitfall 10; oracle-checked in `parse.spec.ts`, listed in `agentflow/differences.spec.ts`). Prototype keys (v12 silent, core `YAML_UNSAFE_KEY`), `SHAPE_REMOVED`'s severity (D461) and the D464 warnings are listed there too, as differences in diagnostics only (no `divergences.json` entry: parity sees no divergence).
- Closed in the #546 review: token ranges map through one offset cursor per parse (a fresh table per `click`/`accDescr {` token was quadratic in the directives; stress shapes at 40,000/320,000 characters, also past `maxTextSize`).
- Ported in the #546 review: the line/column checks of v12's `agentflow-yaml-error-position` and the spans of `agentflow-subgraph-span` (`src/parser/positions.spec.ts`, against v13's ranges); their message and mapping checks stay skipped with reasons.

**For the maintainer (#546):**
- Decided 2026-11-09 ("Yes, amend D468"): edge AST ids follow flowchart's `e:A>B` / `#2` scheme; D468 amended in DECISIONS.md.
- Edge limit: v12 threw `Edge limit exceeded` at 501 (`maxEdges` 500); v13 uses core's resolved limits (R-SEC-5, `DEFAULT_LIMITS.maxEdges` 5,000) with `EDGE_LIMIT` and flowchart's message, as every v13 type does. #550 passes `ctx.limits`.
- The 64-restart cap on lexer restarts after an error is flowchart's (`parser.ts:613`), kept.
- `EDGE_DATA_DROPPED` is copied from flowchart (typed edge `@{}` keys validated, pitfall 10); v12 agentflow had no such check.
- **Choice:** new codes `UNCLOSED_BLOCK` (an unclosed `flow` or `global`; none when its header already failed), `HEADER_COMMENT`; a stray `end` takes the rest of its statement (one error, one diagnostic).
- **Choice:** `LINK_STYLE_INDEX` keeps v12's message verbatim (D461), `between 0 and -1` included when there are no edges.

## #547 T3 layout
- From #546: read `parent` and `collapsedInto` from the model (the cycle is already cut); never derive nesting from `flows[].nodes`. A vertex with a flow's id is not in `vertices` (v12 drew the flow); its styles and classes are the flow's. `edges` can end at `connectors` (v12 kept it; flowchart's `edgeViews` drops it).
- From exploration: v13 flowchart drops an authored `x --> x` whose `x` is inside a collapsed flow (`prepare.ts:335`); v12 agentflow keeps an authored self-loop.

## #548 T4 renderer
- Unblocked: block's shape-geometry T0 (#589) is merged into `mermaid-v13` (ad3648a91) and into this branch (ce62f350c). The `subroutinePadding*`, `leanPadding*` and `crossArrowhead*` rows are core rows (`packages/core/src/theme/vocabulary.ts`, values in `specs/geometry.ts`); add `'agentflow'` to the `usedBy` of each row agentflow's sources read, and nothing else in core.

## #549 T6 language facet
- From #546: the parser takes `probe` (flowchart's decision points, `READ_PAST` exported from `parser/tables.ts`), and `gen:grammar` already writes `src/generated/{categories,docs}.ts` and the highlighters from `grammar/agentflow.ebnf` (an `agentflow` row in `tools/gen-grammar` `GRAMMARS`). Symbols: vertices and connectors `node`, flows `subgraph`, classes `class`, edge ids `edge`.

## #550 T5 integration
- From #546: MIGRATION.md lists v12's removed DB methods (`getSemanticModel()`, `getDiagnostics()`, `getElementAtPosition()`, `getElementMappings()`, `getMappingStats()`; D465), and the docs list the nine reserved diagnostic codes (D461). The plugin passes `ctx.limits`, `ctx.config.flowchart?.inheritDir` and `ctx.config.maxTextSize` to `parseAgentflow`.

## #551 T7 ASCII (optional)
