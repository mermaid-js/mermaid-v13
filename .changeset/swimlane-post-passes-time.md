---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: three more steps of the `swimlane` layout no longer slow down sharply as a diagram grows: the steps that separate edges sharing a track, reorder rails outside the nodes, and remove needless jogs. A diagram with 320 labelled edges between two nodes took about 16 s and now takes about 5 s, with the same layout. Diagrams with several hundred edges between many nodes are still slow, because the edge router itself is.
