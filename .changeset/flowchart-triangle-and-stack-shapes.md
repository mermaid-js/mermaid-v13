---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-flowchart': patch
---

fix: the flowchart `tri` and `flip-tri` shapes are as wide as they are tall again with the label clear of the sides, as in v12, and `procs` and `docs` offset their layers by 5 and 10 px as in v12; edges end on their outlines (#395, #403).
