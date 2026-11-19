---
'@mermaid-js/core': patch
---

chore: the `compass`, `swimlane` and `tree` layout engines share one input check, so the three lazily loaded engines ship about 0.8 KB (gzip) less code. Every error message is unchanged.
