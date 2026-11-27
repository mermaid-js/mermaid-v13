---
'@mermaid-js/diagram-kanban': patch
---

fix: kanban labels read Markdown only when written wholly in backticks (``"`**bold**`"``): plain card text such as ``Use `npm ci` first`` or `- not a list` is drawn as written, and `**x**` without backticks no longer draws bold; `<br>`, the label tags, entities, math and icons still work. A ticket's link leaves out the tags the ticket draws, so `<b>T-1</b>` links to `…T-1`.
