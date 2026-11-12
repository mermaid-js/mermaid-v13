---
'@mermaid-js/core': patch
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-ishikawa': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-timeline': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/diagram-xychart': patch
---

fix: architecture, C4, gantt, gitGraph, ishikawa, packet, quadrant, timeline, use case, venn and XY chart diagrams now enforce the integrator's `limits`. A diagram with more items than `maxNodes` (and, where it has them, more relations than `maxEdges` or deeper nesting than `maxDepth`) is refused with a `LIMIT` error (`NODE_LIMIT`, `EDGE_LIMIT`, `DEPTH_LIMIT`), as the other diagrams already do. `@mermaid-js/core/limits` exports the `checkLimit` and `checkDepth` helpers every diagram parser now reports these with.
