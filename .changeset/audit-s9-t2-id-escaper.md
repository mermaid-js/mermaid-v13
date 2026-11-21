---
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-sankey': patch
---

refactor: the quadrant chart escapes its AST ids, and the sankey diagram names the token in a parse error, with the shared helpers instead of their own code. Diagrams, AST ids and diagnostics are unchanged.
