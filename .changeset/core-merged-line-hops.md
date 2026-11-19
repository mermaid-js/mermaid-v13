---
'@mermaid-js/core': patch
---

fix: with `lineHops` on, crossings on one line too close for a hop each now share one wider hop instead of drawing none, so close crossings, common in class diagrams, still show that the lines do not meet.
