---
'@mermaid-js/diagram-gantt': patch
---

fix: the gantt warning for an unknown task id now says only what applies to an `after`, `until` or `click` that named it, and reports `__proto__` as a reserved id instead of an unknown one.
