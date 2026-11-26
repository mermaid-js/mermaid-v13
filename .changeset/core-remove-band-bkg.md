---
'@mermaid-js/core': patch
---

fix: the v13-only theme variable `bandBkg` is removed, because gantt derives its first section band from `mainBkg`; a `themeVariables.bandBkg` is ignored.
