---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders `mindmap` diagrams as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `mindmap` diagram, laid out with core's two-sided `tree` engine (`@mermaid-js/core/layout/tree`, loaded lazily). `layout: cose-bilkent` and `layout: tidy-tree` map to `tree`; `layered` and an installed `elk.*` are honoured. The `mindmap` config section is honoured (`colorBy`, `padding`, `maxNodeWidth`, `useMaxWidth`); `useWidth` and `layoutAlgorithm` are ignored. The node and depth limits apply to mindmaps. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
