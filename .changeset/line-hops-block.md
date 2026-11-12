---
'@mermaid-js/diagram-block': patch
---

fix: `lineHops: true` (or `'gap'`) now draws a hop (or a gap) where two straight block edges cross. Before, the setting had no effect on block diagrams (#655). Edges still stay plain under `look: handDrawn`.
