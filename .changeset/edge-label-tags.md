---
'@mermaid-js/core': patch
'@mermaid-js/shared': patch
'@mermaid-js/plugin-hand-drawn': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-agentflow': patch
---

Edge labels in flowchart, swimlane, state, class, ER and agentflow diagrams are drawn as tags: a rounded box with a 1 px border in the edge's colour, filled with the theme background, with a little more room around the text. Under `look: handDrawn` the border is sketched. Set `edgeLabelBackground` (or `erEdgeLabelBackground`) to choose another fill.
