---
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-treeview': patch
---

refactor: the event modeling, gitGraph, railroad and treeView diagrams now use the shared probe mode and text-statement table instead of their own copies. Completions, hover, diagrams and diagnostics are unchanged.
