---
'@mermaid-js/diagram-block': patch
'mermaid': patch
---

feat: block diagrams render as text (`format: 'ascii'`, both charsets) from the lazily loaded `@mermaid-js/diagram-block/ascii` entry: boxes on a character grid, one width per column at the widest label, composites as frames, spaces blank, labels cut with `…`, block arrows as boxes with an arrowhead per pointing side, and edges as stepped lines with arrowheads (D449).
