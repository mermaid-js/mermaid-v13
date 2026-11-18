---
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/diagram-requirement': patch
---

Edge labels in block, use case and requirement diagrams are drawn as tags, like the other graph diagrams: a rounded box with a 1 px border in the edge's colour, filled with the theme background, with a little more room around the text. Under `look: handDrawn` the border is sketched. Set `edgeLabelBackground` (block, use case) or `relationLabelBackground` (requirement) to choose another fill.
