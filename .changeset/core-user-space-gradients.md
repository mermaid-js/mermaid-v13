---
'@mermaid-js/core': patch
---

feat: `SvgWriter.linearGradient()` gives any diagram type writer-owned user-space linear gradients (D391): horizontal, two stops, written once each into the root's `<defs>` with an id scoped to the render, so two diagrams on one page never share one. `checkStyle` keeps `mix-blend-mode: normal | multiply` (D392). `assertInert` accepts exactly those, and takes an optional `scope`. Existing output is unchanged.
