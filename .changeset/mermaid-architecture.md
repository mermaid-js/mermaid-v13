---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders `architecture-beta` diagrams as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `architecture` diagram, laid out with `compass` unless `layout` names another engine. The `architecture` section's `padding`, `iconSize` and `useMaxWidth` are honoured; the six fcose settings (`randomize`, `nodeSeparation`, `idealEdgeLengthMultiplier`, `edgeElasticity`, `numIter`, `seed`), `useWidth` and `fontSize` are ignored. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
