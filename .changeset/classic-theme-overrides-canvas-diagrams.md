---
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-xychart': patch
'@mermaid-js/diagram-wardley': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/diagram-cynefin': patch
---

Quadrant, XY chart, Wardley, venn and cynefin diagrams keep their colours under a `primaryColor`, `primaryTextColor`, `background` or `lineColor` override in the `default` theme, and Wardley and cynefin lines keep theirs under a `lineColor` override in `dark`, as in v12; set `canvasBkg`, `canvasLineColor`, `canvasTextColor` or `canvasItemBkg` to recolour them.
