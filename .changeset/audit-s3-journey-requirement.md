---
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-requirement': patch
---

Internal cleanup: journey and requirement diagrams now use the shared lexer loop; no change to rendered diagrams. Journey's layout check no longer reports an actor or task named `NaN` as a broken number.
