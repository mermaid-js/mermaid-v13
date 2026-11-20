---
'@mermaid-js/core': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/diagram-xychart': patch
---

refactor: `@mermaid-js/core/parser-kit` exports the `PLUS` and `BANG` character codes, and the lexers use them. Parsing is unchanged.
