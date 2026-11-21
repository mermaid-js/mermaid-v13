---
'@mermaid-js/diagram-venn': patch
---

fix: a venn set label of two or three lines (a `<br>` or a wrapped label) no longer covers the set's text nodes. The text nodes move down by what the label reaches below one line; under a one-line label they stay where they were (#770).
