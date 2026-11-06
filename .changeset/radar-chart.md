---
'@mermaid-js/diagram-radar': patch
'mermaid': patch
'@mermaid-js/core': patch
---

feat: radar charts (`radar-beta`) render as SVG through `mermaid`, with the ten radar theme variables (`radarAxisColor` … `radarLegendFontSize`, also set through the nested `themeVariables.radar` object) in every theme, and the `radar` config section honoured (`width`, `height`, the four margins, `axisScaleFactor`, `axisLabelFactor`, `curveTension`, `useMaxWidth`). MIGRATION.md lists what differs from v12.
