---
'@mermaid-js/diagram-c4': patch
'mermaid': patch
---

feat: C4 diagrams render as text (`format: 'ascii'`, both charsets) from the lazily loaded `@mermaid-js/diagram-c4/ascii` entry: the SVG's grid on a character grid, elements as boxes with their name, `[Kind]` and description, boundaries as dashed frames (deployment nodes solid) with the label in the top border, and relations as stepped lines with the label at the middle and arrowheads (D459). Never cropped: `ASCII_TOO_WIDE` past `ascii.maxWidth`.
