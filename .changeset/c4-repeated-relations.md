---
'@mermaid-js/diagram-c4': patch
---

fix: C4 draws every relation statement. Two relations between the same pair were merged into one with the last label and an earlier technology, and a `C4Dynamic` step disappeared and the rest were renumbered. Each statement is now a relation of its own, the lines between the same two shapes are spread apart, and `UpdateRelStyle(a, b, …)` styles every relation from `a` to `b` (#680).
