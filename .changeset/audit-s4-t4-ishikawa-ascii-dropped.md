---
'@mermaid-js/diagram-ishikawa': patch
---

refactor: text output builds its `ASCII_DROPPED` warning with the shared `asciiDropped`; `AsciiDroppedWarning` is still exported from `@mermaid-js/diagram-ishikawa/ascii`, now as an alias of that warning's type, and the warning is unchanged.
