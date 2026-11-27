---
'@mermaid-js/diagram-flowchart': patch
---

fix: swimlane lane titles read Markdown only when written wholly in backticks, with or without quotes (``[`**bold** lane`]``); `**x**` without backticks is drawn as written, and `<br>`, the label tags and entities work in every lane title.
