---
'@mermaid-js/diagram-cynefin': patch
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-wardley': patch
---

fix: cynefin, event modeling, user journey, pie, radar, treemap, treeView and Wardley diagrams now enforce the integrator's `limits`. A diagram with more items than `maxNodes` (and, where it has them, more relations than `maxEdges` or deeper nesting than `maxDepth`) is refused with a `LIMIT` error (`NODE_LIMIT`, `EDGE_LIMIT`, `DEPTH_LIMIT`), as the other diagrams already do. Each parser takes the caps as options (`maxNodes`, `maxEdges`, `maxDepth`) and defaults to core's limits.
