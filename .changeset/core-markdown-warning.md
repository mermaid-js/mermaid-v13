---
'@mermaid-js/core': patch
---

feat: `@mermaid-js/core/text/markdown-warning` gives a diagram one `MARKDOWN_NOT_READ` warning per render when a label holds `**bold**` or `_italic_` outside a markdown string, naming both ways back: write a markdown string, or set `markdownAlwaysOn: true`.
