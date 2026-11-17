---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-mindmap': patch
---

chore: kanban and mindmap share more of their parser code, so the two load less of it twice. Parsing and rendering are unchanged.
