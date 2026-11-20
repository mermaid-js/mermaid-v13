---
'@mermaid-js/diagram-sequence': patch
---

refactor: sequence diagrams reuse the shared lexer loop, character tests and text-output helpers instead of their own copies; output is unchanged.
