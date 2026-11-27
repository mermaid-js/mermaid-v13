---
'@mermaid-js/diagram-c4': patch
---

feat: C4 and c4-beta read a quoted markdown string (`"`**x**`"`) as markdown in every text, over the text's own bold or italic; plain `**x**` and bare backticks stay as written, and a written `\n` breaks the line in every text (in c4-beta strings the `\n` escape is now a line break).
