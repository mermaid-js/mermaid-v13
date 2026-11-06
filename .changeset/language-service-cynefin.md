---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the cynefin facet from `@mermaid-js/diagram-cynefin` (an optional peer), so `cynefin-beta` documents get diagnostics, definition and references for the five domains, hover with each domain's decision model, completion, folding and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
