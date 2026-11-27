---
'@mermaid-js/diagram-er': patch
---

fix: an ER entity with no attributes wraps a long name at 120 px, between words and after a hyphen, as v12 did; a single word wider than that stays whole, and an entity with attributes keeps its name on one line.
