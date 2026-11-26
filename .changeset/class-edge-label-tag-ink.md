---
'@mermaid-js/diagram-class': patch
---

fix: class relation labels stay readable on their tag. Two new theme variables: `classEdgeLabelBackground` fills the tag (default `edgeLabelBackground`, so the canvas `background` no longer has to change), and `classEdgeLabelColor` inks the label (default `textColor` where it reads on the tag, else black or white). In the classic themes the label ink is now `textColor` instead of `classText`.
