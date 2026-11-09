---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders usecase diagrams (`usecase-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `usecase` diagram, where they were `UNSUPPORTED_DIAGRAM`. The `usecase` config section is honoured (`wrappingWidth`, `minNodeWidth`, the actor and use case font sizes, weights and families, `nodeSpacing`, `rankSpacing`, `diagramPadding`, `colorScheme`, `useMaxWidth`, `layout`, and `theme`, whose default stays v12's `redux-color`); the two font families now default to the theme's `fontFamily`, `useWidth` and `look` are ignored, and a value of the wrong type warns `USECASE_CONFIG_IGNORED`. Usecase lays out with `layered`, not v12's ELK default. The eight `usecase*` theme variables take their palette slots where a palette is set. Text output (`format: 'ascii'`) throws `UnsupportedFormatError`. MIGRATION.md lists what differs from v12.
