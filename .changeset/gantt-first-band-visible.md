---
'@mermaid-js/diagram-gantt': patch
---

fix: the first section band of a gantt chart is a visible colour in `default`, `neutral`, `forest`, `base` and `dark` (it was near white in `default`); set `sectionBkgColor` to choose your own. The v13-only `bandBkg` theme variable is removed and is now ignored.
