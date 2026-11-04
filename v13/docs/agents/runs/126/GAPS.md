# Gaps, spec #126

Unmet acceptance criteria and announced contracts, under the ticket that owns each one.

## Held

- Released 2026-11-04: M2.5 (#123) merged into `mermaid-v13` and into this branch (`b93d413f6`); #27, #28, #29, #31 closed. #154 (T2) started; #159 (T6) and #155 (T3) follow T2.

## Spec corrections (from 01-v12-class.md)

- At fa796a943 there is one detector (`/^\s*classDiagram/`) and one pipeline: `classDiagram` and `classDiagram-v2` share the jison, `ClassDB` and `classRenderer-v3-unified`. The "v1 and v2 specs" (#153, #154) and "both v12 renderers" (#156) in the tickets mean that single pipeline; `classRenderer.js` and `svgDraw.js` are dead code. The MIGRATION entries in #156 compare against the unified renderer.

## #152 (T0) known limits

Done: merged into `mermaid-v13` as #165 (`5a6425d8e`) and into this branch (`841c1eb64`); #152 closed by the PR. The limits below are accepted, not open work for this spec.


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

## #153 (T1) stress spec under load

- `packages/conformance/src/class/lexer-stress.spec.ts` (2 cases) failed, along with core's `preprocess/stress.spec.ts`, in one full run at load ~30 on 16 cores (2026-11-04, after merging #165). Both pass alone. Watch it; if it flakes again at normal load, give it more trials or a wider ratio.
