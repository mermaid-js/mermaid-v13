---
'@mermaid-js/core': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/language-service': patch
---

fix: a top-level `fontSize` set in the config now sizes sequence actor, message and note text, as in v12; a `sequence.*FontSize` key still wins over it. The top-level `fontSize` no longer has a default of 16, so the resolved config holds it only when it is set; timeline still uses 16 when it is unset.
