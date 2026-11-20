---
'@mermaid-js/diagram-railroad': patch
---

fix: an empty or whitespace-only railroad terminal is drawn as a small 20 × 20 circle again, as in v12, and a terminal's spaces (`"a  b"`, a leading or trailing space, a tab) are drawn as written, in a box sized for them.
