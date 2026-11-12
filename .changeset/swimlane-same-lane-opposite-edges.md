---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: two `swimlane` routing fixes. An edge between two nodes of one lane now stays inside that lane: the step that removes crossings could reroute it round the outside of the diagram, through other lanes, and it is now put back on its best route inside the lane (this can cost a crossing, drawn as a hop clear of the arrowheads). Two opposite edges between the same two nodes now run 12 px apart instead of 4 px, so neither arrowhead covers the other line.
