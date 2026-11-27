---
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-flowchart': patch
---

Architecture labels, kanban columns and cards, railroad special sequences and swimlane lane titles read markdown only in a quoted markdown string (`` "`**bold**`" ``), draw bare backticks as written, break at a written `\n`, and with `markdownAlwaysOn` draw every label as markdown.
