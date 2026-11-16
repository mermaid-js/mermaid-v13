---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: in a `swimlane` diagram, an edge that was a detour and is drawn as a straight line now keeps clear of a corner of another route that leaves the same face. The line moved only 4 px off the face centre and touched that corner; it now moves 6 px, or 12 px beside an arrowhead, when the face has room.
