---
'@mermaid-js/language-service-codemirror': patch
---

feat: first release of `@mermaid-js/language-service-codemirror`, the Mermaid language service in CodeMirror 6: one `await mermaid()` extension with first-paint Lezer highlighting per diagram type (flowchart, sequence, class, state, ER; each type's parser a lazily loaded file of its own), diagnostics, completion, hover, folding, semantic tokens and a cursor-to-AST facet. Every runtime import is a peer (`@codemirror/*`, `@lezer/*`, `@mermaid-js/language-service`, `@mermaid-js/core`).
