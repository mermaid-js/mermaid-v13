---
'@mermaid-js/diagram-gantt': patch
---

fix: under `default`, `dark`, `forest` and `neutral`, an author's `primaryColor` no longer recolours the gantt task bars, the active bar and the alternate section band, as in v12; they now follow `mainBkg`.
