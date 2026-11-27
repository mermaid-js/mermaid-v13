---
'@mermaid-js/diagram-flowchart': patch
---

fix: a written `\n` breaks the line in a flowchart markdown string too, and a label wholly in backticks without quotes is drawn as written; `markdownAlwaysOn: true` draws every flowchart label as markdown.
