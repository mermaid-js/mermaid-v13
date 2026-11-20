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
'@mermaid-js/diagram-wardley': patch
---

refactor: the shared rule parser now reports a syntax error itself by default, so the info, packet and pie parsers no longer carry their own copy. Diagrams, diagnostics and errors are unchanged.
