---
'@mermaid-js/core': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-railroad': patch
---

refactor: the text output of the C4 and railroad diagrams draws its dotted and single-stroke frames with core's new `drawFrame` instead of its own copy. Text output is unchanged.
