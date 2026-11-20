---
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-xychart': patch
---

refactor: treeView and xychart build their drawn bounds with the shared `RectUnion`, and the treeView lexer drops a guard its callers already make. Output is unchanged.
