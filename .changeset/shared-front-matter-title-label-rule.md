---
'@mermaid-js/shared': patch
---

fix: the front-matter `title` of flowchart, class, state, ER and agentflow diagrams follows the label rule: a quoted markdown string (`title: '"`**bold**`"'`) draws as markdown instead of showing its quotes and backticks, and text output prints the drawn words, one line per drawn line.
