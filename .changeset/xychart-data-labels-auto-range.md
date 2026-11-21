---
'@mermaid-js/diagram-xychart': patch
---

fix: XY chart data labels show again when the y range is automatic. A bar too small for its label gets none and the other bars keep theirs, drawn at the size that fits them all; before, one such bar (the lowest bar of an automatic range is a few px high) removed every label. `XYCHART_LABEL_TOO_SMALL` is now raised only when no bar of a plot has room (#537).
