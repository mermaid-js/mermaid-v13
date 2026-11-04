# Gaps, spec #126

Unmet acceptance criteria and announced contracts, under the ticket that owns each one.

## Held

- #154 (T2) and everything after it (#155 T3, #156 T4, #157 T5, #158 interactions, #159 T6) wait for M2.5's #27 and #28 to merge into `mermaid-v13` (D107). #159 also waits for #29 and #31.

## Spec corrections (from 01-v12-class.md)

- At fa796a943 there is one detector (`/^\s*classDiagram/`) and one pipeline: `classDiagram` and `classDiagram-v2` share the jison, `ClassDB` and `classRenderer-v3-unified`. The "v1 and v2 specs" (#153, #154) and "both v12 renderers" (#156) in the tickets mean that single pipeline; `classRenderer.js` and `svgDraw.js` are dead code. The MIGRATION entries in #156 compare against the unified renderer.

## #152 (T0) known limits

- Edges routed `direct` (over MAX_DUMMIES) get no reserved room for end labels; their labels are still placed clear (spec "edge drawn without bends").
- Grid: an edge between a group and its own member (fixture F4) can put the member end's label above the group border.
- Room is reserved for all end labels on a side, so a fan's gap can be taller than needed. T3 may tune it.

## #153 (T1) → later tickets

- #157 (T5): `@mermaid-js/diagram-class` is `"private": true`; make it public and add it to the changeset `fixed` group.
- #154 (T2): add the class line to `PARITY_SUITES` with the model adapter.
- Not class-specific, for the maintainer: with a comment line straight after a multi-line `%%{`, v12 keeps the text, but core's preprocess still reads a directive (D67). The class lexer suite excludes that injection case.
- Lexing is ~1 µs/char on token-dense lines (linear); size/speed work is for milestone close.

## #154 (T2) shared source view (D114)

- v12's input cleanup (offset-preserving source view, `packages/diagram-class/src/parser/source.ts`, a copy of flowchart's) moves into core's parser kit under the state spec's T0 (draft PR into `mermaid-v13`). Keep the class copy until that merges; then switch diagram-class to the shared one and delete the copy. Whichever of that T0 and #152 merges second rebases and reruns `pnpm check`.
