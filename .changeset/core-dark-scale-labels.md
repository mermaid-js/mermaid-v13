---
'@mermaid-js/core': patch
---

fix: `redux-dark` picks each `cScaleLabel` ink by contrast with its `cScale` fill (D544): slot 8's label is black on its light grey fill (11.44:1, was 1.38:1). The other slots, the fills and `neo-dark` are unchanged.
