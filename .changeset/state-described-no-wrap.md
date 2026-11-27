---
'@mermaid-js/diagram-state': patch
---

fix: the title and description rows of a state with several descriptions no longer wrap at 120 px; each breaks only at a written `\n`, as in v12.
