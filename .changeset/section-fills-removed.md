---
'@mermaid-js/core': patch
'@mermaid-js/diagram-journey': patch
'@mermaid-js/language-service': patch
---

`journey.sectionFills` and `timeline.sectionFills` are now removed config keys and warn `CONFIG_REMOVED_KEY`, naming the theme variables that colour the sections instead. They never changed a drawing.
