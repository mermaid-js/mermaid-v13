---
'@mermaid-js/core': patch
'@mermaid-js/diagram-c4': patch
'mermaid': patch
---

feat: c4-beta reads a `c4beta` config section on top of `c4`: `diagramPadding` (default 10) is the margin round the drawing, so 40 makes the canvas 60 px wider and taller, and `useMaxWidth` (default true) sizes the root. A value in `c4` still applies to c4-beta unless `c4beta` sets it. Legacy C4 is unchanged.
