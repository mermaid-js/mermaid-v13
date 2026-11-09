---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders Venn diagrams (`venn-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `venn` diagram. The `venn` config section is honoured (`width`, `height`, `padding`, `useDebugLayout`, `useMaxWidth`, and `theme`, whose default stays v12's `redux-color`); `useWidth` is ignored. Circles are laid out once, at `venn.padding` or v12's 15, so text nodes and hand-drawn circles sit on the drawn circles; the `venn1`…`venn8` theme variables colour the sets, and with `@mermaid-js/plugin-hand-drawn` the circles are sketched. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
