---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-cynefin': patch
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-info': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-wardley': patch
---

chore: the diagrams ported from v12's Langium grammars share one token list builder and one set of `title`, `accTitle` and `accDescr` value readers from `@mermaid-js/shared`; nothing they parse or draw changes (#818).
