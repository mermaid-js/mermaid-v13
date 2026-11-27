---
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/shared': patch
---

fix: railroad terminals, non-terminals, rule names and PEG predicates are drawn exactly as written, as in v12: a typed `&lt;` stays `&lt;`, and a `#lt;` code is still drawn as `<`.
