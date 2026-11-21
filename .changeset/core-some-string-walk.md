---
'@mermaid-js/core': patch
'@mermaid-js/plugin-icons': patch
'@mermaid-js/plugin-math': patch
---

refactor: core exports `someString`, the walk over a parsed model's strings that the icons and math plugins use to find icon names and `$$…$$` math in a diagram that lists no labels. Output is unchanged.
