---
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/shared': patch
'@mermaid-js/language-service': patch
---

fix: an edge `animate` or `animation` in a flowchart or usecase diagram now raises an `EDGE_ANIMATION_IGNORED` warning, once per feature, and `markdownAutoWrap: false` keeps flowchart markdown labels on their own line breaks (#357).
