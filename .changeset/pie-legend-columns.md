---
'@mermaid-js/diagram-pie': patch
---

fix: a pie legend taller than the 450 px canvas (more than 20 one-line rows) now breaks into columns of the canvas height for `legendPosition` `right`, `left`, `top` and `bottom`, instead of one column thousands of px tall; a `center` legend and legends that fit are unchanged (#392).
