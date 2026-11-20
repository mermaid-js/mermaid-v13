---
'@mermaid-js/diagram-info': patch
'@mermaid-js/diagram-packet': patch
'@mermaid-js/diagram-pie': patch
'@mermaid-js/shared': patch
---

Info, packet and pie diagrams now share one parser base for error messages, line ends, `title`/`accTitle`/`accDescr` statements and building the parse result. Parsing, diagnostics and output are unchanged.
