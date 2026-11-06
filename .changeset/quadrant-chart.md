---
'@mermaid-js/diagram-quadrant': patch
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: quadrant charts (`quadrantChart`) render as SVG through `mermaid`, with the 15 `quadrant*` theme variables in every theme, the `quadrantChart` config section honoured where v12 12.2.0 reads it, and the quadrant language facet and highlighters in the language service, server and editor adapters. MIGRATION.md lists what differs from v12.
