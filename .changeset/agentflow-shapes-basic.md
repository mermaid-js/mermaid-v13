---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-flowchart': patch
---

perf: agentflow diagrams load about 2 KB (gzip) less code, because they no longer load flowchart's extended node shapes. C4 now sizes its person figure with the same code as flowchart's `person` shape. Rendered output is unchanged.
