---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-usecase': patch
---

`openSvgRoot` takes a drawing's bounds and trims its title and description, so the graph diagrams no longer round and trim them each; output is unchanged.
