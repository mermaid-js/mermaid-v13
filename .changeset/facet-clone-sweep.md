---
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-cynefin': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-mindmap': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-timeline': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/diagram-wardley': patch
'@mermaid-js/diagram-xychart': patch
'@mermaid-js/shared': patch
---

refactor: the language facets share their completion and hover helpers through `@mermaid-js/shared` (`/parser/facet`, `/parser/flow-facet` and the new `/parser/tree-facet` for kanban and mindmap) instead of keeping copies. Completion and hover are unchanged (#820).
