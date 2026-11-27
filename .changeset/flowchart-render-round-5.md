---
'@mermaid-js/core': patch
'@mermaid-js/shared': patch
'mermaid': patch
'@mermaid-js/diagram-flowchart': patch
---

perf: flowcharts render faster: the flow parser, SVG tag and attribute checks, the font table measurer, the analysis cache and the layered layout's edge routes do less work per render. Rendered output is unchanged.
