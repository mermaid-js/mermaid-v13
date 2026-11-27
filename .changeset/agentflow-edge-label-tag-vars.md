---
'@mermaid-js/diagram-agentflow': patch
---

fix: agentflow edge labels stay readable on their tag. Two new theme variables: `agentflowEdgeLabelBackground` fills the tag (default `edgeLabelBackground`) and `agentflowEdgeLabelColor` inks the label (default `textColor` where it reads on the tag, else black or white). An edge's own text colour still wins.
