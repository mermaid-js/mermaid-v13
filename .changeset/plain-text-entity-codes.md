---
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-railroad': patch
---

fix: gantt, gitGraph, treeView and railroad diagrams draw entity codes as their characters: `#35;`, `#quot;`, `#lt;` and `#9829;` draw `#`, `"`, `<` and `♥`, where `&#35;`, `&quot;` and `&lt;` were drawn, in the SVG and in text output (`format: 'ascii'`). A `#name;` with a name Mermaid does not know is drawn as written.
