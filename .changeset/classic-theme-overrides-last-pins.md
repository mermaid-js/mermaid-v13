---
'@mermaid-js/core': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-venn': patch
---

State transitions (in `default` and `dark`), state composite title strips, colourless sequence `rect` blocks and venn's secondary and tertiary sets (in `default`) keep their colours under a `lineColor`, `mainBkg`, `secondaryColor` or `tertiaryColor` override, as in v12.
