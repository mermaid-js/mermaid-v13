---
'@mermaid-js/diagram-c4': patch
---

fix: C4 relation labels stay readable on their tag. Two new theme variables: `c4EdgeLabelBackground` fills the tag (default `edgeLabelBackground`) and `c4EdgeLabelColor` inks the label (default `textColor` where it reads on the tag, else black or white). `c4RelationColor` now defaults to `textColor`, so relation lines and labels differ from `#444444` in the built-in themes.
