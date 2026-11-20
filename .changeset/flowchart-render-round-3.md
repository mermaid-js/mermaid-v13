---
'@mermaid-js/core': patch
'@mermaid-js/shared': patch
'mermaid': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/language-service': patch
---

perf: flowcharts render faster: diagram detection, config resolution, label measuring, SVG writing, edge drawing and the layered layout do less work per render. Rendered output is unchanged.
