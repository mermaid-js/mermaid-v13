---
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/shared': patch
---

An ER attribute whose generic type is named like an HTML tag (`List~Data~`, `string~U~`) is drawn as written, as in v12, instead of losing the generic with an `HTML_DROPPED` warning.
