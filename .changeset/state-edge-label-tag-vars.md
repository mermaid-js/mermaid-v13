---
'@mermaid-js/diagram-state': patch
---

fix: state transition labels stay readable on their tag. Two new theme variables: `stateEdgeLabelBackground` fills the tag (default `edgeLabelBackground`) and `stateEdgeLabelColor` inks the label (default `textColor` where it reads on the tag, else black or white).
