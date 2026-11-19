---
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/shared': patch
---

fix(er): an attribute type with a generic named like an HTML tag is drawn as written: `List~Data~` draws `List<Data>`, not `List` with an `HTML_DROPPED` warning, as in v12.
