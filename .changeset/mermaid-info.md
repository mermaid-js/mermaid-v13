---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders `info` diagrams through `createMermaid()`, `render()` and `mermaid/slim` with the `info` diagram: one line, `v` and the version of `mermaid`, as SVG or, with `format: 'ascii'`, as text. `showInfo` is accepted and draws nothing extra, as in v12. MIGRATION.md lists what differs from v12.
