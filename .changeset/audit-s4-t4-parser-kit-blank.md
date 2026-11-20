---
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-state': patch
---

refactor: the flowchart and state lexers use the parser kit's `isBlank` and character codes instead of local copies; parsing is unchanged.
