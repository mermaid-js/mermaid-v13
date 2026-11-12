---
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

fix: CodeMirror and Monaco highlight a C4 `title` or `accDescription` with a `#` in it as one title, up to the end of the line.
