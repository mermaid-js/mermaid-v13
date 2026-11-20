---
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-xychart': patch
---

refactor: the pie, quadrant and XY chart parse options take their `maxNodes` cap typed from core's `Limits`. Diagrams, diagnostics and limits are unchanged.
