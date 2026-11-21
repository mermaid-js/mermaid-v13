---
'@mermaid-js/diagram-cynefin': patch
---

fix: a cynefin domain with a long item list no longer runs into the next domain. The row of quadrants grows to fit its longest list, and the horizon, the confusion ellipse and the lower row move down with it. Lists of four items or fewer draw as before.
