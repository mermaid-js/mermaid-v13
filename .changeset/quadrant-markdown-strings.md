---
'@mermaid-js/diagram-quadrant': patch
---

fix: a quadrant chart's title reads a quoted markdown string (`` "`**bold**`" ``) as markdown, as its axis, quadrant and point labels do, and a written `\n` breaks the line in every label.
