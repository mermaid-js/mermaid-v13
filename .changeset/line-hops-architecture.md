---
'@mermaid-js/diagram-architecture': patch
---

fix: `lineHops: true` (or `'gap'`) now draws a hop (or a gap) where two architecture edges cross. Before, the setting had no effect on architecture diagrams (#655). Edges still stay plain under `look: handDrawn`.
