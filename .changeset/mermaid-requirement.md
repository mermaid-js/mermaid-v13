---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders requirement diagrams (`requirementDiagram`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `requirement` diagram. The `requirement` config section is honoured (`theme`, whose default stays v12's `redux-color`, `layout` and `useMaxWidth`, which v12 read from `state`); `useWidth` and v12's `rect_*`, `fontSize`, `text_color` and `line_height` keys are ignored, as v12's renderer never read them. The documented requirement theme variables now take effect; styling lost to the order of the text, relations to unknown names, duplicate and shared names each warn once. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
