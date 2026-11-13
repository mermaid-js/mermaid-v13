---
'@mermaid-js/diagram-flowchart': patch
---

fix: the `person` shape keeps c4model.com's proportions. A one-line label no longer draws a 13 px head on a flat bar: the head scales with the body's width, the body is at least 0.6 times as tall as it is wide, and the label is centred below the head.
