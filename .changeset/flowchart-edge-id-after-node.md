---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

fix: a flowchart edge id may follow a node directly, as in v12 12.3.0: `A[bla]e1@--> B`, `A@{ shape: circle } e1@--> B` and `A[me@example.com] --> B` now parse. An edge id can no longer contain `[ ] ( ) { } |` (`A e[1]@--> B` is a syntax error). Agentflow is unchanged.
