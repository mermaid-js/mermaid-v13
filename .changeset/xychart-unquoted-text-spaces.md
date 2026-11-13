---
'@mermaid-js/diagram-xychart': patch
---

fix: unquoted XY chart text keeps the spaces between its words. `title Sales Report` reads `Sales Report` and `x-axis [jan feb, mar]` has a first category `jan feb`, where 12.2.0 joined the words (`SalesReport`, `janfeb`). A run of blanks is one space and the ends are trimmed; quote the text to keep a run of blanks.
