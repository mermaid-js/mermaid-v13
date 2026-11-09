---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the treemap facet from `@mermaid-js/diagram-treemap` (an optional peer), so `treemap` documents get diagnostics, definition and references for classes (each section and leaf name its own symbol), rename, hover with a section's sum and leaf count and each value as `valueFormat` prints it, completion, folding of sections and `accDescr`, and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
