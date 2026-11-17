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

Internal refactor of how the SVG root is opened; rendered SVG is unchanged. `@mermaid-js/diagram-railroad` now needs `@mermaid-js/shared` as a peer dependency, like the other diagram packages.
