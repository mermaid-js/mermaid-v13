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
- D468 says "the edge's model id for edges (`@2` for a reopened id)" but also "flowchart's scheme"; flowchart's scheme is `e:A>B`, `e:A>B#2` (`diagram-flowchart/src/parser/ast.ts:3`). Kept flowchart's; D468's wording needs amending (D460).
- Edge limit: v12 threw `Edge limit exceeded` at 501 (`maxEdges` 500); v13 uses core's resolved limits (R-SEC-5, `DEFAULT_LIMITS.maxEdges` 5,000) with `EDGE_LIMIT` and flowchart's message, as every v13 type does. #550 passes `ctx.limits`.
- The 64-restart cap on lexer restarts after an error is flowchart's (`parser.ts:613`), kept.
- `EDGE_DATA_DROPPED` is copied from flowchart (typed edge `@{}` keys validated, pitfall 10); v12 agentflow had no such check.
- **Choice:** new codes `UNCLOSED_BLOCK` (an unclosed `flow` or `global`; none when its header already failed), `HEADER_COMMENT`; a stray `end` takes the rest of its statement (one error, one diagnostic).
- **Choice:** `LINK_STYLE_INDEX` keeps v12's message verbatim (D461), `between 0 and -1` included when there are no edges.

## #547 T3 layout
- Closed: nesting from the model's `parent`/`collapsedInto` only (a parent that is no frame is dropped; the invariants flag it). A flow-id vertex styles the flow (`styleOf(flow.classes, flow.styles)`).
- Closed: v12's self-loop rule. An authored `x --> x` inside a collapsed flow stays as a loop on the card; flowchart v13 drops it (`prepare.ts:335`), agentflow does not (`baseline/layout/collapsed-flow-keeps-authored-self-loop.mmd`).
- **Choice:** an edge with an end drawn nowhere (the reserved `connectors`) is left out of the layout, with no new warning: the parse already warns `AGENTFLOW_RESERVED_ID` ("its edges have no end there").
- **Choice:** the layout moves each edge end on a node from its layout box onto the shape's outline (`layout/ends.ts`, ray straight in from the side; from inside the box along the route), so the layout itself meets "ends on outlines" with every engine. Flowchart does this at draw time; #548 draws from the same `shapeOutline` geometry. Rounded corners are honoured (flowchart's `rounded` has no inset).
- **Choice:** config lengths that are not numbers warn `AGENTFLOW_CONFIG_IGNORED` (a new code; path names the key, `agentflow.*` or `flowchart.padding`/`subGraphTitleMargin.*`) and draw with the default. The defaults are `layout/metrics.ts` (`AGENTFLOW_LENGTH_DEFAULTS`) until #550 adds `agentflow` to `SECTION_OWNERS` and the generated defaults replace them.
- **Choice:** `flowchart.subGraphTitleMargin` (D466) adds `top + bottom` to a titled frame's top padding (v12 grew the cluster by the total margin); #548 places the title `top` below the frame's top. Flowchart v13 still leaves the key `pending`.
- Found (engine, not fixed here): an edge from a member to the flow that holds it (`a --> f` inside `f`, the mutual-containment shape) is routed by `layered` from the node's centre to the frame's centre; the layout moves the node end onto its outline and leaves the frame end inside the frame. Flowchart has the same route.
- Theme reads (D152): `fontFamily`, `fontSize`, `radius`, `nodePadding*`, `hexagonPadding*`, `hexagonSlant`, `subroutinePadding*`, `leanPadding*`; `agentflow` is in their core `usedBy` now (`theme-used-by.spec.ts` no longer lists it as not drawn). Core size unchanged (`usedBy` is not in the closure).

## #548 T4 renderer
- Unblocked: block's shape-geometry T0 (#589) is merged into `mermaid-v13` (ad3648a91) and into this branch (ce62f350c). The `subroutinePadding*`, `leanPadding*` and `crossArrowhead*` rows are core rows (`packages/core/src/theme/vocabulary.ts`, values in `specs/geometry.ts`); add `'agentflow'` to the `usedBy` of each row agentflow's sources read, and nothing else in core. (#547 added it for the padding rows, `radius`, `fontFamily` and `fontSize`; the renderer adds the colour and arrowhead rows it reads.)
- From #547: draw each shape from `shapeOutline(shape, w, h, pads, metrics)` (or a path that matches it: rounded `rx = min(radius, w/2, h/2)`, the refdoc's two quadratic halves) so edge ends stay on the drawn outline; the layout's edge ends are already there. Palette order (v12 `containerOrder`) is not in the views yet.

## #549 T6 language facet
- From #546: the parser takes `probe` (flowchart's decision points, `READ_PAST` exported from `parser/tables.ts`), and `gen:grammar` already writes `src/generated/{categories,docs}.ts` and the highlighters from `grammar/agentflow.ebnf` (an `agentflow` row in `tools/gen-grammar` `GRAMMARS`). Symbols: vertices and connectors `node`, flows `subgraph`, classes `class`, edge ids `edge`.

## #550 T5 integration
- From #546: MIGRATION.md lists v12's removed DB methods (`getSemanticModel()`, `getDiagnostics()`, `getElementAtPosition()`, `getElementMappings()`, `getMappingStats()`; D465), and the docs list the nine reserved diagnostic codes (D461). The plugin passes `ctx.limits`, `ctx.config.flowchart?.inheritDir` and `ctx.config.maxTextSize` to `parseAgentflow`.

## #551 T7 ASCII (optional)
