---
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-xychart': patch
'@mermaid-js/shared': patch
---

refactor: the quadrant, radar, treemap and XY chart diagrams check their number options with one shared reader instead of their own copies. Diagrams and config warnings are unchanged.
