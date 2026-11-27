---
'@mermaid-js/diagram-er': patch
---

fix: ER labels read markdown only in a markdown string (`` "`…`" ``), which now draws without its backticks; plain `**bold**` and `_italic_` are drawn as written with one `MARKDOWN_NOT_READ` warning, and `legacyMarkdown: true` draws them as v12 did.
