---
'@mermaid-js/diagram-gantt': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-timeline': patch
'@mermaid-js/shared': patch
---

refactor: the gantt, gitGraph and timeline diagrams read their config lengths with one shared reader instead of three copies. Diagrams and config warnings are unchanged.
