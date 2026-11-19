---
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/shared': patch
---

fix: a front-matter `title` is drawn above flowchart, class, state and ER diagrams again, as in v12, `titleTopMargin` above the drawing, and the drawing grows to hold it. A sequence diagram draws it as its title when the text has no `title` line.
