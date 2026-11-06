---
'@mermaid-js/language-service': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the mindmap facet from `@mermaid-js/diagram-mindmap` (an optional peer), so `mindmap` documents get diagnostics, definition, references, rename (node ids alone, classes together), hover, completion, folding per subtree and semantic tokens; CodeMirror and Monaco get first-paint highlighting for mindmaps.
