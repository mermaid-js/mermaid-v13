---
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-usecase': patch
---

refactor: diagrams take their palette slots from the one shared copy, so agentflow and state diagrams load slightly less code. Rendered output is unchanged.
