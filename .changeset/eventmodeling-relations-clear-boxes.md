---
'@mermaid-js/diagram-eventmodeling': patch
---

fix: event modeling relations that leave one side of a box leave from distinct points (under a box with a self loop, left of the loop), and a relation between lanes that would run through or along another box (or its label) goes around it.
