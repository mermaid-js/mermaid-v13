---
'@mermaid-js/core': patch
---

fix: a large `swimlane` diagram lays out a little faster. The router finds the routed segments a step crosses by the line they run on instead of scanning all of them; the layout is unchanged.
