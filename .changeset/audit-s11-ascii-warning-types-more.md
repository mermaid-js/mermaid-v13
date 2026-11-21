---
'@mermaid-js/diagram-ishikawa': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-usecase': patch
---

refactor: the ishikawa, treeView and usecase text output warning types alias `AsciiDroppedWarning` and `AsciiRouteWarning` from `@mermaid-js/shared/ascii` instead of declaring their own. Warnings are unchanged.
