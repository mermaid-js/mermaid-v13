---
'@mermaid-js/diagram-treeview': patch
---

fix: tree view node names follow the label rule: tags draw, `<br>` and a written `\n` break the line and grow the row, and a quoted markdown string is drawn as markdown; any other name is drawn as written, unless `markdownAlwaysOn` draws every name as markdown.
