---
'@mermaid-js/diagram-agentflow': patch
---

fix: agentflow labels follow the core label rules: a written `\n` breaks the line in a markdown string too, a connector title written as a markdown string is drawn as markdown, `markdownAlwaysOn` draws every label as markdown, and plain labels with markdown warn `MARKDOWN_NOT_READ`.
