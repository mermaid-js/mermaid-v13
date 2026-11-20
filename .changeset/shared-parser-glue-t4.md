---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/diagram-treeview': patch
'@mermaid-js/diagram-xychart': patch
---

refactor: class, ER, journey, packet, quadrant, railroad, treemap, treeView and XY chart share their token views, range trimming, error-message quoting and config-section reading instead of keeping copies. Output, diagnostics and completions are unchanged.
