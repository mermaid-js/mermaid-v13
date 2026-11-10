---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the block facet from `@mermaid-js/diagram-block` (an optional peer), so `block` documents get diagnostics, definition, references and rename of block ids and class names, hover with a block's shape, span, columns and children, completion of keywords, shapes, link kinds, arrow directions and used ids, folding of composites and semantic tokens; CodeMirror and Monaco get first-paint highlighting for block diagrams, each a lazily loaded file of its own.
