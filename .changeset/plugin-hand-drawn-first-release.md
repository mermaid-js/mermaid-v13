---
'@mermaid-js/plugin-hand-drawn': patch
'@mermaid-js/core': patch
'mermaid': patch
---

feat: first release of `@mermaid-js/plugin-hand-drawn`, the hand-drawn look. Register `handDrawn` with `registerExternalDiagrams([handDrawn])` and set `handDrawn: true`, or v12's `look: handDrawn` at the top level or in a diagram section. Flowchart, class, state and ER outlines are sketched with roughjs 4.6.6's DOM-free generator, with v12's roughjs options per role, in the theme's own colours. `handDrawnSeed` moves from core's config to the plugin; 0 is a fixed seed (2147483647), so the output is the same on every render, in Node and the browser. Without the plugin, `handDrawnSeed` is an unknown key and `LOOK_REMOVED` names the package. The layout never changes, and text output gets one `ASCII_DROPPED` warning (`feature: 'handDrawn'`). The sketch adapter (`sketch(tag, attrs, options, seed)`) is exported too.
