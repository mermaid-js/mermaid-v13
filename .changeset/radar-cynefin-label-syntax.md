---
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-cynefin': patch
---

fix: radar and cynefin labels read markdown only in a quoted markdown string (`"`…`"`), so a title in bare backticks is drawn as written and a cynefin title written as `"`…`"` is now markdown; a written `\n` breaks the line in every label, `markdownAlwaysOn: true` draws every label as markdown, and a render warns once when a plain label holds markdown that is drawn as written.
