# Gaps, spec #126

Unmet acceptance criteria and announced contracts, under the ticket that owns each one.

## Held

- #154 (T2) and everything after it (#155 T3, #156 T4, #157 T5, #158 interactions, #159 T6) wait for M2.5's #27 and #28 to merge into `mermaid-v13` (D107). #159 also waits for #29 and #31.

## Spec corrections (from 01-v12-class.md)

- At fa796a943 there is one detector (`/^\s*classDiagram/`) and one pipeline: `classDiagram` and `classDiagram-v2` share the jison, `ClassDB` and `classRenderer-v3-unified`. The "v1 and v2 specs" (#153, #154) and "both v12 renderers" (#156) in the tickets mean that single pipeline; `classRenderer.js` and `svgDraw.js` are dead code. The MIGRATION entries in #156 compare against the unified renderer.
