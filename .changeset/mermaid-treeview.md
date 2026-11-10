---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders tree views (`treeView-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `treeView` diagram, and as text (`format: 'ascii'`, both charsets) from the lazily loaded `./ascii` entry. The `treeView` config section is honoured (`rowIndent`, `paddingX`, `paddingY`, `lineThickness`, `showIcons`, `defaultIconPack`, `filenameIcons`, `extensionIcons`, `useMaxWidth`; an invalid value falls back with a `TREEVIEW_CONFIG_INVALID` warning), and the seven tree view theme variables can be set flat (`treeViewLineColor`, …) or nested under `themeVariables.treeView`, as in v12; dark themes draw readable labels, connectors and icons. Icons other than the built-in file and folder come from an icons extension. MIGRATION.md lists what differs from v12.
