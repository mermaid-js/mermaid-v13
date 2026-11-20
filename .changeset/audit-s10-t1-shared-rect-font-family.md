---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-cynefin': patch
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-info': patch
'@mermaid-js/diagram-ishikawa': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-sankey': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-timeline': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-xychart': patch
---

refactor: diagrams use the shared `Rect` layout type and one shared check for the font families their config sets. Output is unchanged.
