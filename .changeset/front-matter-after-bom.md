---
'@mermaid-js/core': patch
---

fix: a diagram saved as UTF-8 with a byte order mark now renders with its front matter. The BOM before the opening `---` is skipped, so `title` and `config` apply; before, the source was rejected with "The front matter is never closed".
