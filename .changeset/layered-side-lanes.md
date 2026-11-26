---
'@mermaid-js/core': patch
'@mermaid-js/diagram-architecture': patch
---

fix: under `layout: layered`, architecture lines are drawn at right angles and kept apart: no two share a run, the lines on one side of a service or junction attach apart, and a label sits beside its line instead of turning the line back through it (#1212). The code that draws lines out of named sides moves to `@mermaid-js/core/layout/sides`, which only architecture loads: `layered` no longer reads `LayoutEdge.sides`, and a caller that names sides passes its model to `honourSides(graph, model)` from that subpath.
