---
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-xychart': patch
'@mermaid-js/diagram-wardley': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/diagram-cynefin': patch
---

In the `default` and `dark` themes, quadrant, XY chart, Wardley, venn and cynefin diagrams keep their own colours under a `themeVariables` override of `primaryColor`, `primaryTextColor`, `background` or `lineColor` wherever v12 kept them; set `canvasBkg`, `canvasLineColor`, `canvasTextColor` or `canvasItemBkg` to recolour them.
