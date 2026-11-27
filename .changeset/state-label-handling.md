---
'@mermaid-js/diagram-state': patch
---

State labels read markdown only in a markdown string (`` "`…`" ``), which now renders in every label, and a written `\n` breaks the line; `markdownAlwaysOn: true` draws every label as markdown.
