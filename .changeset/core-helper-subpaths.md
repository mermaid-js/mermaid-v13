---
'@mermaid-js/core': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-cynefin': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-info': patch
'@mermaid-js/diagram-ishikawa': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-mindmap': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-sankey': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-timeline': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/diagram-wardley': patch
'@mermaid-js/diagram-xychart': patch
---

refactor: the SVG root, parser stop and id-escape, and config-reader helpers that each diagram package copied now come from `@mermaid-js/core` (`/svg/document`, `/parser-kit`, `/parser-kit/support`, `/config/readers`). Output is unchanged (#701).
