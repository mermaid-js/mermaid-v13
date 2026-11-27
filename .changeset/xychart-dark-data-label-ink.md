---
'@mermaid-js/diagram-xychart': patch
---

fix: in the redux-dark, redux-dark-color and neo-dark themes, xychart data labels inside bars are drawn in a dark ink that reads on the light bars, or in the light text when the chart's own `plotColorPalette` starts with a dark colour. Labels outside the bars keep the canvas text colour, and the new `xyChart.dataLabelOutsideColor` theme variable sets their colour.
