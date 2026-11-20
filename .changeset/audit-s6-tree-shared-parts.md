---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-mindmap': patch
'@mermaid-js/diagram-xychart': patch
'@mermaid-js/plugin-interactions': patch
---

refactor: kanban and mindmap share their class names and token tables, mindmap asks core for placeholder icons, and `@mermaid-js/diagram-xychart` no longer re-exports `tokenValue` and `V12Text` of `@mermaid-js/shared` from its root (`tokenValue` is in `./testing`); output is unchanged.
