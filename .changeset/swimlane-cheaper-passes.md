---
'@mermaid-js/core': patch
---

perf: the swimlane layout orders, routes and untangles many links between lanes faster, with the same drawing: 400 nodes with 200 extra links between 8 lanes take about a sixth of the CPU time they took (#843).
