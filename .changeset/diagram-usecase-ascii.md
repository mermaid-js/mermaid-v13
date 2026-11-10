---
'@mermaid-js/diagram-usecase': patch
'mermaid': patch
---

feat: usecase diagrams render as text (`format: 'ascii'`, both charsets) from the lazily loaded `@mermaid-js/diagram-usecase/ascii` entry: the same graph laid out in cells with `layered`, actors as a three-line figure with the name under it, use cases as `( label )` (`[ label ]` for rect), boundaries as frames with the title in the top border, notes on a dotted line, JSON tables as key/value boxes, include and extend dotted with `«include»`/`«extend»` (`<<include>>` in ascii) and generalization with `▷` (`|>`). Business marks, icons and the hollow and awesome figures are dropped with one `ASCII_DROPPED` (D478).
