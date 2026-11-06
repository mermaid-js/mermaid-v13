---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders `pie` charts as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `pie` diagram. The `pie` config section is honoured (`textPosition`, `donutHole`, `legendPosition`, `highlightSlice`, `useMaxWidth`), and the pie theme variables (`pie1`–`pie12`, the pie text, stroke and `pieOpacity` variables) carry each theme's v12 values; `pieOpacity` is a new `opacity` kind, a number from 0 to 1. MIGRATION.md lists what differs from v12.
