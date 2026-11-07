---
'@mermaid-js/plugin-interactions': patch
---

feat: gantt callbacks (`click a call fn()`) are bound to the task's bar and label, and a lone `"` argument is passed as `''`, as v12 did.
