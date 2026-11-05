---
'@mermaid-js/language-service': patch
---

fix: rename applies its edits in one pass, so its read-back check is linear in the document size instead of growing with size × occurrences
