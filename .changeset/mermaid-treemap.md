---
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/plugin-hand-drawn': patch
---

feat: `mermaid` renders treemaps (`treemap`, `treemap-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `treemap` diagram. The new `treemap` config section is honoured (`padding`, `diagramPadding`, `showValues`, `nodeWidth`, `nodeHeight`, `valueFormat`, `useMaxWidth`; an invalid value falls back with a `TREEMAP_CONFIG_INVALID` warning), and the title takes `treemapTitleColor` and `treemapTitleFontSize`, also nested under `themeVariables.treemap`. `@mermaid-js/plugin-hand-drawn` reads `treemap.look: handDrawn` as `handDrawn: true`, as every section's `look`; treemaps are not sketched, as in v12. MIGRATION.md lists what differs from v12.
