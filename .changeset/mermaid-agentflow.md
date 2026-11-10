---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders agentflow diagrams (`agentflow-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `agentflow` diagram. The `agentflow` config section is honoured (`theme`, `titleTopMargin`, `diagramPadding`, `nodeSpacing`, `rankSpacing`, `wrappingWidth`, `minNodeWidth`, `useMaxWidth`, `layout`), and `flowchart.padding`, `flowchart.inheritDir` and `flowchart.subGraphTitleMargin` are read as in v12; `useWidth` is ignored. Agentflow lays out with `layered` by default instead of v12's ELK, and draws each theme's own geometry instead of v12's forced `look: neo`. `SHAPE_REMOVED` is a warning, so those diagrams still render; v12's silent drops warn once per kind. With `@mermaid-js/plugin-hand-drawn` vertices, frames, cards and edges are sketched. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12, the removed DB methods included.
