---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the venn facet from `@mermaid-js/diagram-venn` (an optional peer), so `venn-beta` documents get diagnostics (one per unknown id), definition and references for set and text-node ids, rename that adds quotes when needed, hover, completion, folding of a set with its indented `text` lines and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
