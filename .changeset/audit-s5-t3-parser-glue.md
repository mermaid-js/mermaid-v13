---
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/shared': patch
---

fix: completing `accTitle` or `accDescr` in a gitGraph before text that starts with a blank now keeps the colon (`accTitle:`). The C4, ER, gantt, gitGraph and usecase parsers reuse shared scan and message helpers; their output is unchanged.
