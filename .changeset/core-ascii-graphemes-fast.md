---
'@mermaid-js/core': patch
---

perf: text output measures lines of printable ASCII, box drawing and the ellipsis without `Intl.Segmenter`. The split and the widths are the same; drawing large text diagrams is faster.
