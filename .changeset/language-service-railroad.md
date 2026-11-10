---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the railroad facet from `@mermaid-js/diagram-railroad` (an optional peer), so documents in the four railroad notations get diagnostics (with hints where v12 reads a `title`-prefixed rule name or an ABNF `;` comment differently from what is written, and a warning at a rule that is never defined), definition and references for rule names, rename, hover (a rule's first line, an ABNF repeat's bounds), completion of headers, keywords, operators and defined rule names, folding of multi-line rules, comments and specials and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it (the IR grammar's, for all four notations), each a lazily loaded file of its own.
