---
'@mermaid-js/diagram-c4': patch
---

C4 relation labels are drawn as tags, as other edge labels are: the label and its `[technology]` in one rounded box with a 1 px border in the relation's colour, filled with the theme background, with a little more room around the text. Under `look: handDrawn` the border is sketched. The classes `c4-rel-label-box`, `c4-rel-label` and `c4-rel-techn` are gone; select `g.edgeLabel` inside `g.c4-relation` instead.
