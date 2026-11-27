---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-usecase': patch
---

fix: the front-matter `title` follows the label rule: a quoted markdown string (`title: '"`**bold**`"'`) draws as markdown instead of showing its quotes and backticks, `markdownAlwaysOn: true` draws every title as markdown, markdown in a plain title gives the `MARKDOWN_NOT_READ` warning, and text output prints the drawn words, one line per drawn line.
