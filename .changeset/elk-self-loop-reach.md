---
'@mermaid-js/layout-elk': patch
---

fix: under `layout: elk` a self-loop reaches out from its node as far as under the default layout, with its two ends spread along the side, so an ER self-relationship shows both cardinality marks full size and apart and its label clear of them.
