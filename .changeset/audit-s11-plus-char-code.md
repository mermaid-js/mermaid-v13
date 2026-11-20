---
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-sankey': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/diagram-wardley': patch
---

refactor: the class, packet, sankey, sequence, venn and wardley lexers use the `PLUS` character code from `@mermaid-js/core/parser-kit` instead of their own. Parsing is unchanged.
