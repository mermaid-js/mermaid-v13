---
'@mermaid-js/diagram-timeline': patch
---

fix: a timeline now warns (`TIMELINE_PALETTE_IGNORED`) when it sets `cScale`, `cScaleInv` or `cScaleLabel` theme variables that the active theme does not use, and suggests `theme: default`; the drawing does not change.
