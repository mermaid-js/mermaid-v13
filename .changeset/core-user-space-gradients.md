---
'@mermaid-js/core': patch
---

feat: `SvgWriter.linearGradient()` gives any diagram type writer-owned user-space linear gradients (D391): horizontal, two stops, written once each into the root's `<defs>` with an id scoped to the render, so two diagrams on one page never share one. `SvgWriter` gains this as a required member, so a writer wrapper must forward it. D392: an author's `style`, `classDef` or `linkStyle` now keeps `mix-blend-mode: normal | multiply` in every type that applies author styles, written as the shape's `style`; any other value is still dropped with a warning, and output for inputs without it is unchanged. `assertInert` accepts exactly these, and takes an optional `scope`.
