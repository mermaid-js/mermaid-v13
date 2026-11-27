---
'@mermaid-js/diagram-packet': patch
---

fix: a packet field's end bit number is no longer drawn when it would run into the next bit number (narrow fields, 3-digit numbers, `paddingX: 0`); start numbers always stay.
