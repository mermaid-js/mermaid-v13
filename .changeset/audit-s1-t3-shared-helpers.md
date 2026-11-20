---
'@mermaid-js/diagram-cynefin': patch
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-info': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-wardley': patch
'@mermaid-js/shared': patch
---

refactor: the cynefin, event modeling, info, pie, radar, railroad, treemap, treeView and wardley diagrams now use shared lexer, parser, text and completion helpers instead of their own copies. Diagrams, diagnostics, errors and completions are unchanged.
