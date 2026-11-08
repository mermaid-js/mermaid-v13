---
'@mermaid-js/core': patch
---

fix: a theme spec that leaves out `cScale`, `cScaleInv`, `cScaleLabel`, `git`, `gitInv` or `gitBranchLabel` gets them derived from its own base colours, as v12's base theme derives them, instead of drawing `currentColor`. The built-in themes write all six and are unchanged.
