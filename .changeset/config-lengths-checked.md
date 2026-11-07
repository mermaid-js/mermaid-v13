---
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-flowchart': patch
---

fix: config lengths (`padding`, `nodeSpacing`, `rankSpacing`, `diagramPadding`, `wrappingWidth`, `minNodeWidth`, `minEntityWidth`, `entityPadding`) take a number or a whole numeric string (`"20"`), as the other ported types do. `"20px"` was read as 20 with no warning; it and any other value that is no length (negative, 10000 or more, not a number) now lay out with the default and warn `CLASS_CONFIG_IGNORED`, `ER_CONFIG_IGNORED`, `STATE_CONFIG_IGNORED` or `FLOWCHART_CONFIG_IGNORED` once per key.
