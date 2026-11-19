---
'@mermaid-js/core': patch
'mermaid': patch
'@mermaid-js/language-service': patch
---

An embedded `mermaid id { … }` block now drops its body's common indentation before the inner diagram is read, so an indented event model with a `data` block renders. Errors still point at the line and column you wrote.
