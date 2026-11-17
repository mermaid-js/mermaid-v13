---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-agentflow': patch
---

fix: the `step`, `stepBefore` and `stepAfter` curves draw right-angle corners and look different from each other (the step in the middle, near the start, near the end of the leg), and an unknown `curve` name warns `CURVE_UNKNOWN` once per render before drawing S-curves (#356).
