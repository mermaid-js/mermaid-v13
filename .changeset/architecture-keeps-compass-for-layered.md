---
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/language-service': patch
---

fix: an architecture diagram keeps its `compass` layout when `layout` is `layered` or `dagre`, including a site-wide `initialize({ layout: 'dagre' })`, and adds one `ARCHITECTURE_LAYOUT_IGNORED` warning. Those engines place nodes without reading the edge sides, so services stacked in one column and junctions broke; in v12, architecture always used its own layout. `compass` and an installed `elk.*` are still taken by name (#673).
