---
'@mermaid-js/core': patch
'mermaid': patch
'@mermaid-js/layout-elk': patch
---

feat: line hops are on by default. Where two edges cross, the one that gives way draws a small arc, in every diagram that draws edges; set `lineHops: false` to draw plain crossings. The hop code is now part of core, so `renderSync` needs nothing preloaded for it, and `preload({ layouts: ['lineHops'] })` is no longer needed (it still resolves and loads nothing).
