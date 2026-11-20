---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: in a `swimlane` diagram that flows top to bottom or bottom to top, neighbouring lanes no longer overlap when twice the node spacing is less than the padding of the two lanes (a node spacing below 20, or a lane padding wider than the node spacing). Every node keeps its lane padding, and the lanes now touch. Across a lane border the gap between nodes can be wider than the node spacing. Left to right and right to left diagrams are unchanged.
