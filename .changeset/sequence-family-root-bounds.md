---
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-mindmap': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-timeline': patch
---

Sequence, gantt, journey, timeline, gitGraph, kanban, mindmap and railroad open their SVG root through the shared bounds and title trimming; railroad now uses the shared root. Output is unchanged.
