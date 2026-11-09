---
'@mermaid-js/diagram-xychart': patch
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: XY charts (`xychart`, `xychart-beta`) render as SVG through `mermaid`, with the thirteen XY chart theme variables (`xyChartBackgroundColor` … `xyChartPlotColorPalette`, also set through the nested `themeVariables.xyChart` object) in every theme, and the `xyChart` config section honoured from every source (`width`, `height`, the title, data label, legend and orientation keys, `plotReservedSpacePercent`, the `xAxis` and `yAxis` keys, `useMaxWidth`). A diagram plugin can name a config section other than its id (`DiagramPlugin.configSection`). The XY chart language facet and highlighters are in the language service, server and editor adapters. MIGRATION.md lists what differs from v12.
