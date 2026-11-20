---
'@mermaid-js/core': patch
'@mermaid-js/diagram-info': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-xychart': patch
'@mermaid-js/shared': patch
---

refactor: core's `ParseOptions` now has the optional `preprocessed` field (D677), so the info, pie, quadrant and XY chart parse options and the shared flow parser options no longer declare it themselves. Diagrams and diagnostics are unchanged.
