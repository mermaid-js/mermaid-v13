---
'@mermaid-js/diagram-gantt': patch
---

Gantt titles, section names and task labels now draw `<b>`, `<i>`, `<br>` and the other common tags, break at a written `\n`, read a quoted markdown string (`` "`**bold**`" ``) as markdown, and with `markdownAlwaysOn` draw every label as markdown.
