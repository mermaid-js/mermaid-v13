---
'@mermaid-js/core': patch
'@mermaid-js/shared': patch
'@mermaid-js/diagram-class': patch
---

fix: a comma inside a `style` or `classDef` value no longer splits it: `fill:rgb(255, 200, 200)` and `font-family:Georgia, serif` keep the whole value.
