---
'@mermaid-js/diagram-agentflow': patch
'mermaid': patch
---

feat: agentflow diagrams render as text (`format: 'ascii'`, both charsets) from the lazily loaded `@mermaid-js/diagram-agentflow/ascii` entry: the same graph laid out in cells with `layered`, each kind as flowchart's text form (a task rounded, a tool with double sides, an input with a slant, a decision a diamond, a refdoc a folded corner, an action a hexagon), flows as frames with their title on the top border, collapsed flows as boxes marked `+`, `--x` ending in a cross and `-.-` dotted (D469). Never cropped (`ASCII_TOO_WIDE`); styles, curves, emphasis, animation, links, SVG-only options and accessibility text are dropped with one `ASCII_DROPPED` per kind.
