---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-xychart': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-usecase': patch
---

The quadrant, XY chart, class, flowchart, agentflow, state and use case diagrams build their editor token lists with the shared helper, so their packages ship less code; the tokens are unchanged.
