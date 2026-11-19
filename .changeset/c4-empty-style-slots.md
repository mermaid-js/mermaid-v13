---
'@mermaid-js/diagram-c4': patch
---

An empty positional slot in `UpdateElementStyle` (`UpdateElementStyle(a,,,,,,,"NewTech")`) now means "the default", as in v12, and no longer warns `C4_COLOR_INVALID`. A non-empty colour the check refuses still warns.
