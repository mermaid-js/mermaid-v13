---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the C4 facet from `@mermaid-js/diagram-c4` (an optional peer), so C4 documents get diagnostics, definition, references and rename of element and boundary aliases, hover with keyword docs and the slot an argument fills, completion of the headers, macros, `$` names and known aliases, folding of boundaries and `accDescr { … }`, and semantic tokens; CodeMirror and Monaco get first-paint highlighting for C4 diagrams, each a lazily loaded file of its own.
