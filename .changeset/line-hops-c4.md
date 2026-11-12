---
'@mermaid-js/diagram-c4': patch
---

fix: `lineHops: true` (or `'gap'`) now draws a hop (or a gap) where two straight C4 relation lines cross. Before, the setting had no effect on C4 diagrams (#655). Relation lines still stay plain under `look: handDrawn`.
