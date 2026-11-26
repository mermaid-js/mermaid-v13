---
'@mermaid-js/diagram-block': patch
---

fix: block edge labels stay readable on their tag. Two new theme variables: `blockEdgeLabelBackground` fills the tag (default `edgeLabelBackground`) and `blockEdgeLabelColor` inks the label (default `textColor` where it reads on the tag, else black or white). In the dark redux and neo themes the ink is now `#cccccc`.
