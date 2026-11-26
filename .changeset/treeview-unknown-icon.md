---
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/shared': patch
'@mermaid-js/diagram-architecture': patch
---

fix: treeView draws v12's blue `?` square in the icon slot of an icon that cannot be drawn, instead of leaving a blank gap; architecture's identical glyph moves to `@mermaid-js/shared`, with its output unchanged.
