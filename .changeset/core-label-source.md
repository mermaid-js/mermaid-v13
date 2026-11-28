---
'@mermaid-js/core': patch
---

feat: `labelSource` from `@mermaid-js/core/text` reads a label by one rule for every diagram type: only a quoted markdown string draws markdown, and a written `\n` breaks the line in every label.
