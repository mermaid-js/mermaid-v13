---
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-er': patch
---

State, sequence and requirement diagrams now stop with a `LIMIT` error when they pass the integrator's `limits.maxNodes` or `limits.maxEdges`, as the other diagram types do, and the ER limit message no longer says that part of the diagram was left out.
