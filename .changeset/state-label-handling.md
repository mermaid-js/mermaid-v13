---
'@mermaid-js/diagram-state': patch
---

State labels read markdown only in a markdown string (`` "`…`" ``), which now renders in every label, and a written `\n` breaks the line; `legacyMarkdown: true` draws plain `**bold**` and `_italic_` as v12 did.
