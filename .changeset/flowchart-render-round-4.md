---
'@mermaid-js/core': patch
'@mermaid-js/shared': patch
'mermaid': patch
'@mermaid-js/diagram-flowchart': patch
---

perf: flowcharts render faster: front matter, diagram detection, theme and text config resolution, line hops, render bookkeeping and the layered layout do less work per render. Rendered output is unchanged.
