---
'@mermaid-js/diagram-packet': patch
'mermaid': patch
---

feat: packet diagrams render as text (`format: 'ascii'`, both charsets) from the lazily loaded `@mermaid-js/diagram-packet/ascii` entry: the rows as one table of boxes, two columns a bit, labels cut to their field, bit numbers above each row, `descending` mirrored and the title below (D347).
