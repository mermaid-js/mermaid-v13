---
'@mermaid-js/core': patch
---

fix: the layered layout no longer turns a cycle upside down when a node in it is declared before the edges that reach it, such as a state diagram choice declared first.
