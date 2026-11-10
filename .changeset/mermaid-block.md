---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders block diagrams (`block`, `block-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `block` diagram. The `block` config section is honoured (`padding`, `useMaxWidth`, and a block-scoped `theme`); `useWidth` and `layout` are ignored. v12's model bugs are fixed (an edge chain declares every block, `class` before a declaration and `class a, b` apply, `root` is an id, a leaf later opened as a composite keeps its children), `style` on later or unknown ids is accepted with a warning, a composite's label gets a band above its grid, a self-loop is drawn as an arc, and degenerate sizes are clamped with a warning. With `@mermaid-js/plugin-hand-drawn` the leaf shapes are sketched. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
