---
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
---

feat: the `markdownAlwaysOn` config key, at the top level or in a diagram's section (`flowchart.markdownAlwaysOn`), reads every label as markdown, as a markdown string is read; tags and line breaks are read as without it.
