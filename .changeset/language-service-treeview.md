---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the tree view facet from `@mermaid-js/diagram-treeview` (an optional peer), so `treeView-beta` documents get diagnostics (box-drawn lines at their source column), definition and references (each node its own symbol), rename that keeps or adds quotes, hover with a node's path and icon, completion of annotations and `icon(` packs, folding of each subtree and `accDescr`, and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
