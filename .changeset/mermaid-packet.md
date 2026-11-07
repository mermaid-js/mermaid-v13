---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders packet diagrams (`packet`, `packet-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `packet` diagram. The `packet` config section is honoured (`rowHeight`, `bitWidth`, `bitsPerRow`, `showBits`, `bitOrder`, `paddingX`, `paddingY`, `useMaxWidth`; an invalid value falls back with a `PACKET_CONFIG_INVALID` warning), and the ten packet theme variables can be set flat (`packetBlockFillColor`, …) or nested under `themeVariables.packet`, as in v12. MIGRATION.md lists what differs from v12.
