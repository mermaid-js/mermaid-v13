---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-railroad': patch
---

Railroad's editor support (completion, hover and hints) now uses the facet helpers shared with the other diagram types, so its language bundle carries less duplicated code. Completion, hover and hints are unchanged.
