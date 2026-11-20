---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-timeline': patch
'@mermaid-js/diagram-venn': patch
---

refactor: the lexers share one helper for line breaks and entity placeholders, in `@mermaid-js/shared/parser/state`. Parsing is unchanged.
