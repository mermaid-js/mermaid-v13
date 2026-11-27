---
'@mermaid-js/diagram-usecase': patch
---

fix: use case relationship labels stay readable on their tag. Two new theme variables: `usecaseEdgeLabelBackground` fills the tag (default `edgeLabelBackground`) and `usecaseEdgeLabelColor` inks the label (default `textColor` where it reads on the tag, else black or white). The ink follows `textColor` instead of `primaryTextColor`, so it differs in some built-in themes.
