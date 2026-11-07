---
'@mermaid-js/diagram-radar': patch
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: radar charts (`radar-beta`) render as SVG through `mermaid`, with the ten radar theme variables (`radarAxisColor` … `radarLegendFontSize`, also set through the nested `themeVariables.radar` object) in every theme, and the `radar` config section honoured (`width`, `height`, the four margins, `axisScaleFactor`, `axisLabelFactor`, `curveTension`, `useMaxWidth`); the radar language facet and highlighters are in the language service, server and editor adapters. MIGRATION.md lists what differs from v12.
