---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the sankey facet from `@mermaid-js/diagram-sankey` (an optional peer), so `sankey` documents get diagnostics at the field, definition, references and rename of node names (quoting a new name that needs it), hover with a node's in and out totals and a value's number, completion of the names already used, folding of the body and semantic tokens; CodeMirror and Monaco get first-paint highlighting for sankey diagrams, each a lazily loaded file of its own.
