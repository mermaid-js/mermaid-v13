---
'@mermaid-js/core': patch
'@mermaid-js/diagram-flowchart': patch
---

perf: labels that wrap, or break only at line breaks, are laid out in one pass; attribute values that cannot need escaping are written without the check; the layered layout reuses its scratch arrays and skips sorting rows already in order. The SVG is the same; drawing flowcharts is faster.
