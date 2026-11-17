---
'@mermaid-js/diagram-c4': patch
---

feat: c4-beta accepts `a --- b`, a relation with no arrowhead at either end. It splits from the ids round it, so `a---b` is the id `a`, the arrow and the id `b`. `----` and `--->` are still errors. Legacy C4 is unchanged.
