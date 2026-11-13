---
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/language-service': patch
---

fix: an architecture diagram is laid out with the configured `layout`, `compass` by default; under `layered` or `dagre` services are ranked down the flow, the edge sides only set where lines attach, and one `ARCHITECTURE_PLACEMENT_IGNORED` warning names what that layout ignores (#673).
