---
'@mermaid-js/diagram-requirement': patch
---

fix: requirement relation labels stay readable on their tag: the label ink is `textColor` where it reads on the tag, else black or white, and the new theme variables `requirementEdgeLabelBackground` and `requirementEdgeLabelColor` set the tag's fill and ink (`relationLabelBackground` and `relationLabelColor` still win).
