---
'@mermaid-js/diagram-agentflow': patch
---

fix: with no curve set, agentflow draws its edges with the default curve, `rounded`, as flowchart does, instead of S-curves; set `flowchart.curve: basis` to keep them.
