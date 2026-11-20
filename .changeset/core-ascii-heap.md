---
'@mermaid-js/core': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-block': patch
---

feat: `@mermaid-js/core/ascii` exports `Heap`, the min-heap its route repair searches with, with a choice of tie-break; the C4 and block ASCII routers use it instead of their own copies. Output is unchanged.
