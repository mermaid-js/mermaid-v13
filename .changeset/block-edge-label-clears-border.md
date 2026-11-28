---
'@mermaid-js/diagram-block': patch
---

fix: an edge label that would sit on a block's border, such as a composite's top edge, slides along its edge until it clears the border, without coming to rest inside another block or over an arrowhead; where its edge is too short for that, it sits beside the line.
