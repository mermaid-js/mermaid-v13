---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the event modeling facet from `@mermaid-js/diagram-eventmodeling` (an optional peer), so `eventmodeling` documents get diagnostics, definition and references for frame ids, data names and entity names, rename that keeps frame ids at one to three digits, hover with a frame's lane and its sources (explicit or inferred), completion, folding of data blocks, notes and `accDescr`, and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
