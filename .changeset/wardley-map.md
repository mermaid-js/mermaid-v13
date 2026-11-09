---
'@mermaid-js/diagram-wardley': patch
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: Wardley maps (`wardley-beta`) render as SVG through `mermaid`, with the thirteen wardley theme variables (`wardleyBackgroundColor` … `wardleyAnnotationFill`, also set through the nested `themeVariables.wardley` object, and `wardleyEvolutionColor`) in every theme, and the `wardley-beta` config section honoured from every source, front matter and `%%{init}` included (`width`, `height`, `padding`, `nodeRadius`, `nodeLabelOffset`, `axisFontSize`, `labelFontSize`, `showGrid`, `useMaxWidth`). A diagram plugin can name a config section other than its id (`DiagramPlugin.configSection`). The wardley language facet and highlighters are in the language service, server and editor adapters. MIGRATION.md lists what differs from v12.
