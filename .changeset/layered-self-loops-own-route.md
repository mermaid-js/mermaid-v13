---
'@mermaid-js/core': patch
---

fix: several self-loops on one node are no longer drawn over one another. In flowchart, class, state, ER and requirement diagrams the second loop goes on the opposite side of the node and later ones nest outward, alternating sides; a node with one self-loop is drawn as before.
