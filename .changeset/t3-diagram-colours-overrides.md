---
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-eventmodeling': patch
---

fix: requirement, sequence, state, architecture and event model colours respond to a `lineColor`, `background` or `mainBkg` override as in v12: requirement and event model lines keep the theme's colour in `default` and `dark`, architecture edges in `dark`, state's composite fill in `default`, and `dark`'s sequence activations follow `mainBkg`.
