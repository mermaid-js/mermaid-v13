---
'@mermaid-js/language-server': patch
---

feat: the language server answers `textDocument/documentHighlight` (the other uses of the name under the cursor), `textDocument/selectionRange` (expand and shrink the selection from a name to the whole text) and `textDocument/documentSymbol` (the outline, nested by subgraph, composite state or namespace) (#810).
