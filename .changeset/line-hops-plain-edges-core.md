---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: line hops now reach edge lines that are never sketched. `SvgWriter.plainEdge(attrs)` writes exactly `leaf('path', attrs)` and is never given to an outline drawer, but the shared edge-path step finds it as it finds `outline('edge', 'path', …)`, so `lineHops` applies to it (#655). Writers that wrap an `SvgWriter` need to forward the new method.
