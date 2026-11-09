---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders Ishikawa (fishbone) diagrams (`ishikawa`, `ishikawa-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `ishikawa` diagram. The `ishikawa` config section is honoured (`diagramPadding`, `useMaxWidth`, whose documented default becomes `true`, the value v12 drew with, and `theme`); `useWidth` is ignored. With `@mermaid-js/plugin-hand-drawn` the head, label boxes, spine and bones are sketched. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
