---
'@mermaid-js/core': patch
'@mermaid-js/shared': patch
'mermaid': patch
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-usecase': patch
---

Type declarations no longer name private types: every type that an exported function or class takes or returns is exported or written out where it is used, and each type has one exported name. Behaviour and rendered output are unchanged.
