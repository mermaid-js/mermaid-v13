---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders `timeline` diagrams (LR and TD) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `timeline` diagram. The `timeline` config section is honoured where v12 12.2.0 reads it (`leftMargin`, `padding`, `useMaxWidth`, `disableMulticolor`, and the top-level `fontSize` in box heights); the keys v12's timeline never read are ignored. `Theme.paletteRgba()` gives a palette's colour channels. MIGRATION.md lists what differs from v12.
