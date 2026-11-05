---
'@mermaid-js/plugin-hand-drawn': patch
---

feat: first release of `@mermaid-js/plugin-hand-drawn`. This release has the sketch adapter only: `sketch(tag, attrs, options, seed)` turns an outline (`rect`, `circle`, `ellipse`, `polygon`, `line`, `path`) into hand-drawn `<path>` attributes with roughjs 4.6.6's DOM-free generator, written through core's `PathBuilder`. A seed of 0 is a fixed seed (2147483647), so the output is the same on every render, in Node and the browser. The `look: handDrawn` extension comes in a later release.
