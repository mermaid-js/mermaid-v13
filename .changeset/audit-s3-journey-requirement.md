---
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-requirement': patch
---

Journey and requirement lexers use the shared lexer loop; journey's layout check no longer flags an actor or task named `NaN`.
