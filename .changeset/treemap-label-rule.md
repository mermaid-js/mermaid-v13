---
'@mermaid-js/diagram-treemap': patch
---

feat: treemap labels draw tags such as `<b>` and `<br>`, break at a written `\n`, and read a quoted markdown string as markdown; a section header keeps a multi-line label's first line, followed by `...`. With `markdownAlwaysOn` every treemap label is drawn as markdown.
