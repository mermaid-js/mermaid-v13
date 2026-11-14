---
'@mermaid-js/diagram-mindmap': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-sequence': patch
---

fix: mindmap, state, requirement and class labels are read as v12 read them: bold and italic are formatted, and a label that starts with `- `, `* ` or `+ ` or holds backticks is drawn as written, where a bullet or monospace text was drawn. Only a mindmap markdown string (`` "`…`" ``) has bullets and inline code. In sequence diagrams a `\n` written as two characters is text again, and only `<br>` breaks the line. In class diagrams a `#name;` with a name Mermaid does not know is drawn as written.
