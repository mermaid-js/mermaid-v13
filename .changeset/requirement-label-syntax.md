---
'@mermaid-js/diagram-requirement': patch
---

Requirement names and values read markdown only in a markdown string ("`**bold**`") and break the line at a written `\n`; plain `**bold**` draws as written with one `MARKDOWN_NOT_READ` warning, and `legacyMarkdown: true` reads it as v12 did.
