---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the packet facet from `@mermaid-js/diagram-packet` (an optional peer), so `packet` documents get diagnostics, definition (each field label its own symbol), rename, hover with each field's bits, completion of the next start bit, folding and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
