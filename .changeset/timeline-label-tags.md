---
'@mermaid-js/diagram-timeline': patch
---

fix: timeline labels draw `<b>`, `<i>` and the other label tags instead of showing them as written, and a label wholly in backticks (``"`**bold**`"``) is drawn as Markdown without its backticks.
