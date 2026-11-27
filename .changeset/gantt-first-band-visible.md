---
'@mermaid-js/diagram-gantt': patch
---

fix: gantt section bands alternate like zebra rows in `default`, `neutral`, `forest`, `base` and `dark`: the first and third bands share one visible colour (the first was near white in `default`, the third barely showed); set `sectionBkgColor` (and `sectionBkgColor2`) to choose your own. The v13-only `bandBkg` theme variable is removed and is now ignored.
