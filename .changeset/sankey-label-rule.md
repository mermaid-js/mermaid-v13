---
'@mermaid-js/diagram-sankey': patch
---

fix: sankey node names follow the label rule of every diagram type: tags draw, `<br>`, a written `\n` and a line break in a quoted name break the line, and a name written as `"`**markdown**`"` is drawn as markdown; plain names and the value after them are drawn as before, and `markdownAlwaysOn: true` draws every name as markdown.
