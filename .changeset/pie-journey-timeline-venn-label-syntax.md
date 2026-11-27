---
'@mermaid-js/diagram-pie': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-timeline': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/shared': patch
---

Pie, journey, timeline and venn labels read markdown only in a quoted markdown string (`` "`…`" ``), so a label in backticks without quotes is drawn as written; a written `\n` breaks the line, `markdownAlwaysOn: true` draws every label as markdown, and a render warns once when a plain label holds markdown that is drawn as written.
