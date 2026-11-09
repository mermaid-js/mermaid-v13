---
'@mermaid-js/core': patch
'mermaid': patch
---

feat: the `compass` layout engine at `@mermaid-js/core/layout/compass`, Pele's grid placement from edge sides (D326), loaded lazily by `mermaid`. Any graph type can select it with `layout: compass` (D327, D502); edges without sides take them from `direction`. `LayoutGraph` gains four optional fields that only `compass` reads: `LayoutEdge.sides`, `LayoutEdge.border`, `LayoutGraph.align` and `LayoutNode.anchorY` (D501).
