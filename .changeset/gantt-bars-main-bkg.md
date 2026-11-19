---
'@mermaid-js/core': patch
'@mermaid-js/diagram-gantt': patch
---

fix: under `default`, `dark`, `forest` and `neutral`, an author's `primaryColor`, `tertiaryColor` or `lineColor` no longer recolours the gantt bars, section bands, active outline and `vert` marker, as in v12; they follow `mainBkg` and the new `bandBkg` and `guideLineColor` theme variables instead.
