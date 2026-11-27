---
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-cynefin': patch
---

fix: radar and cynefin labels read markdown only in a quoted markdown string (`"`…`"`), so a title in bare backticks is drawn as written and a cynefin title written as `"`…`"` is now markdown; a written `\n` breaks the line in every label.
