---
'@mermaid-js/core': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-xychart': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-treemap': patch
---

refactor: the label mode of a v12 Markdown label and the decoder of v12's entity placeholders, which several diagram packages copied, now come from `@mermaid-js/core` (`/text/v12-label`, `/text/tags-only`, `/parser-kit/support`). Nothing is drawn differently.
