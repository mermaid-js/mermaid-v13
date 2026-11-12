---
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-cynefin': patch
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-mindmap': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-sankey': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-wardley': patch
---

refactor: these diagrams report a breached `maxNodes`, `maxEdges` or `maxDepth` through the shared helpers in `@mermaid-js/core/limits` instead of a copy each. The errors and their messages are unchanged.
