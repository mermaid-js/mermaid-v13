---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders `sankey` diagrams as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `sankey` diagram. The `sankey` config section is honoured (`width`, `height`, `linkColor`, `nodeAlignment`, `nodeWidth`, `nodePadding`, `showValues`, `prefix`, `suffix`, `labelStyle`, `nodeColors`, `useMaxWidth`, whose default is now `true` as v12 drew it); `useWidth` is ignored. A colour that fails the colour check is dropped with one `SANKEY_COLOR_INVALID` warning, and an option it cannot use falls back to its default with `SANKEY_CONFIG_INVALID`. A cycle is a parse error, an invalid value counts as 0 with a warning, and the node and edge limits apply. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
