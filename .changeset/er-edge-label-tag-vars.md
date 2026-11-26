---
'@mermaid-js/diagram-er': patch
---

fix: ER relationship labels stay readable on their tag. New theme variable `erEdgeLabelColor` inks the label (default `textColor` where it reads on the tag, else black or white); `erEdgeLabelBackground` still fills it.
