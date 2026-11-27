---
'@mermaid-js/diagram-railroad': patch
---

fix: a railroad special sequence (`? … ?`) draws `<br>`, `<b>`, `<i>` and the other drawn tags, and a markdown string in backticks; terminals and rule names are still drawn as written.
