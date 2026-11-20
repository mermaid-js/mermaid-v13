---
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-wardley': patch
'@mermaid-js/shared': patch
---

refactor: the architecture, railroad, radar and wardley lexers and parsers now use the shared rule lexer and parser code instead of their own copies. Diagrams, diagnostics and errors are unchanged.
