---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: the `swimlane` layout no longer takes tens of seconds on small graphs with many crossing edges. A 2 KB `swimlane-beta` diagram with 40 nodes and 80 edges took about 20 s and now takes under a second, with the same layout. The step that reroutes edges to remove crossings scored each candidate route against every pair of edges; it now counts a candidate's crossings from an index of the routes. Very large swimlane diagrams (several hundred edges) are still slow.
