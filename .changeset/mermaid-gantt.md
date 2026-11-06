---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders `gantt` charts as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `gantt` diagram, in host local time with `now` as a render option (D270, D275). The `gantt` config section is honoured (lengths, font sizes, `numberSectionStyles`, `axisFormat`, `tickInterval`, `topAxis`, `displayMode`, `useWidth`, `useMaxWidth`, and `weekday`, which v12 never read). The gantt theme variables derive from the shared ones in every theme; a clickable label is v12's `#003163`, no longer a theme variable. MIGRATION.md lists what differs from v12.
