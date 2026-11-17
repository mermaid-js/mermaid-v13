---
'@mermaid-js/core': patch
---

fix: a `swimlane` diagram with many edges into one node lays out faster. The terminal tail swap reads the routes from indexes instead of recounting every pair of edges for each swap it tries; the layout is unchanged.
