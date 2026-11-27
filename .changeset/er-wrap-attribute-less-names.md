---
'@mermaid-js/diagram-er': patch
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
---

fix: an ER entity with no attributes wraps a long name at the new `er.wrappingWidth` (120 px by default), between words and after a hyphen, as v12 did; a single word wider than that stays whole, and an entity with attributes keeps its name on one line.
