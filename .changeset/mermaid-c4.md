---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders C4 diagrams (`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `c4` diagram. The detector anchors all five headers, so a flowchart or sequence diagram that mentions `C4Container` is no longer taken for C4. The `c4` config section is honoured (lengths, `c4ShapeInRow`, `c4BoundaryInRow`, `wrap`, `useMaxWidth`, fonts, the element palette, and a C4-scoped `theme`); a font family left unset takes the theme's `fontFamily`; `height`, `boxMargin`, `wrapPadding`, `useWidth` and `layout` are ignored. v12's parse quirks that damaged the model are fixed, `accTitle` no longer sets the visible title, relations are routed round shapes, colours pass core's colour check, and the dark themes get readable relation, boundary and title colours. With `@mermaid-js/plugin-hand-drawn` the elements are sketched. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
