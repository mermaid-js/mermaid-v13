---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-agentflow': patch
---

fix: a node label written in shape data (`a@{ label: "…" }`) is plain text unless its value is a markdown string (`` "`…`" ``), in flowchart, swimlane and agentflow diagrams; `**x**` is drawn as written and warns `MARKDOWN_NOT_READ`, and `markdownAlwaysOn: true` draws it as markdown.
