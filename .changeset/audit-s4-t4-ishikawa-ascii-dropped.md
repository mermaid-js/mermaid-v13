---
'@mermaid-js/diagram-ishikawa': patch
---

refactor: text output builds its `ASCII_DROPPED` warning with the shared `asciiDropped`, so the `AsciiDroppedWarning` type is no longer exported from `@mermaid-js/diagram-ishikawa/ascii`; the warning is unchanged.
