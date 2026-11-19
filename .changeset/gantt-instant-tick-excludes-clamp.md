---
'@mermaid-js/diagram-gantt': patch
---

fix: A gantt whose dates are a single instant (one milestone, or a `0d` task) draws one axis tick and date label at that instant, as v12 does. An `excludes` range that starts before the first task is drawn from the plot's left edge, so it no longer widens the picture to the left.
