---
'@mermaid-js/core': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-sankey': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-venn': patch
---

fix: a misspelt colour (`redd`, `#12345`) in a sequence `rect`, journey, sankey, railroad or C4 colours, or `themeVariables` is ignored with a warning and the theme's or default colour is drawn, instead of black; a journey colour list keeps its order around one, a dropped `venn<n>` keeps the palette colour, and a misspelt `color` in a `classDef` warns once.
