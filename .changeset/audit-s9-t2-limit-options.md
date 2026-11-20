---
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/shared': patch
---

refactor: the parse options of the block, class, ER, sequence and state diagrams, and of the shared flow parser, take their `maxEdges`, `maxNodes` and `maxDepth` caps typed from core's `Limits`. Diagrams, diagnostics and limits are unchanged.
