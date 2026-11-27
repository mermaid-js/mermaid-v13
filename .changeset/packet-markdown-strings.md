---
'@mermaid-js/diagram-packet': patch
---

fix: a packet field label or title written as a quoted markdown string (`` "`**bold**`" ``) renders as markdown, in SVG and text output, instead of showing its backticks; a written `\n` in the title breaks the line, and `markdownAlwaysOn` draws every label as markdown.
