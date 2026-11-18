---
'@mermaid-js/diagram-class': patch
---

fix: `limits.maxNodes` now stops every class diagram with more classes than the limit, also when a relation such as `A --> B` adds two new classes at once (#748).
