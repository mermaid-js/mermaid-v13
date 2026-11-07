---
'mermaid': patch
---

feat: `mermaid` renders Cynefin framework diagrams (`cynefin-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `cynefin` diagram. The `cynefin` config section is honoured (`width`, `height`, `padding`, `showDomainDescriptions`, `boundaryAmplitude`, `seed`, `useMaxWidth`), and the fifteen cynefin theme variables can be set flat (`cynefinComplexBg`, …) or nested under `themeVariables.cynefin`, as in v12. MIGRATION.md lists what differs from v12.
