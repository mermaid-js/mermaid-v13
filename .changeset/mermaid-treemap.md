---
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/plugin-hand-drawn': patch
---

feat: `mermaid` renders treemaps (`treemap`, `treemap-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `treemap` diagram. The new `treemap` config section is honoured (`padding`, `diagramPadding`, `showValues`, `nodeWidth`, `nodeHeight`, `valueFormat` with every d3-format specifier v12 took, `useMaxWidth`; an invalid value falls back with a `TREEMAP_CONFIG_INVALID` warning), and `borderWidth`, `valueFontSize` and `labelFontSize`, which v12 never read, are ignored. Section outlines take `cScalePeer0`–`cScalePeer11`, and the title `treemapTitleColor` and `treemapTitleFontSize`, also set under `themeVariables.treemap`, as in v12. With `@mermaid-js/plugin-hand-drawn`, `treemap.look: handDrawn` turns the hand-drawn look on, as the other sections' `look` does; treemaps themselves are not sketched, as in v12. MIGRATION.md lists what differs from v12.
