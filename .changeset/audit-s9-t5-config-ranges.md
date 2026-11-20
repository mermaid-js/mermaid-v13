---
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-wardley': patch
'@mermaid-js/shared': patch
---

refactor: the wardley diagram checks its length options with the shared number reader, and the radar, packet and treemap models take their title, accessibility and warning fields from one shared type. Diagrams and config warnings are unchanged.
