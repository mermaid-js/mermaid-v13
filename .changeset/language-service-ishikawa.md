---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the ishikawa facet from `@mermaid-js/diagram-ishikawa` (an optional peer), so `ishikawa` documents get diagnostics (an information diagnostic at each clamped cause), definition and references for each cause, rename of a cause's label, hover, header completion, folding of each cause's subtree and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
