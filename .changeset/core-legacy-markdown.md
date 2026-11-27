---
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
---

feat: the `legacyMarkdown` config key restores v12's reading of `**bold**` and `_italic_` written without a markdown string, in the label kinds where v12 read it; tags, line breaks and markdown strings are read as without it.
