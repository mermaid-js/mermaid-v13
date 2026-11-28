---
'@mermaid-js/diagram-mindmap': patch
---

fix: mindmap reads markdown only in a markdown string (`` "`…`" ``), in every node form; plain `**bold**` is drawn as written with one `MARKDOWN_NOT_READ` warning, and `markdownAlwaysOn: true` draws every label as markdown. A written `\n` now breaks the line.
