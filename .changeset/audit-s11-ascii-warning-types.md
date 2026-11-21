---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-sequence': patch
---

refactor: the text output warning types `AsciiDroppedWarning` and `AsciiRouteWarning` are declared once, in `@mermaid-js/shared/ascii`. Warnings are unchanged.
