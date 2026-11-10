---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders event models (`eventmodeling`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `eventmodeling` diagram. The `eventmodeling` config section's `padding` and `useMaxWidth` are honoured (an invalid value falls back with an `EVENTMODELING_CONFIG_INVALID` warning); `rowHeight` and `useWidth` are ignored, as v12 never read them. Boxes and lanes take the `em*` theme variables, with v12's dark values in every dark theme, and the new `emTextColor` colours their text. Event models are not sketched with `@mermaid-js/plugin-hand-drawn`, as in v12, and text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
