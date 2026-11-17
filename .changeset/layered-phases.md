---
'@mermaid-js/core': patch
---

refactor: the layered layout engine runs as named phases in files of their own instead of one large function. Rendered SVG and text output are unchanged; the core bundle grows by about 0.7 KB gzip.
