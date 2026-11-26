---
'@mermaid-js/diagram-flowchart': patch
---

fix: flowchart and swimlane edge labels stay readable on their tag. Two new theme variables: `flowchartEdgeLabelBackground` fills the tag (default `edgeLabelBackground`) and `flowchartEdgeLabelColor` inks the label (default `textColor` where it reads on the tag, else black or white). A `linkStyle … color` still wins.

A direct caller of `renderFlowchart` now builds `ctx.theme` with the flowchart table (`createTheme(spec, { diagram: flowchart.theme })`), as `renderState` and `renderClass` already need theirs.
