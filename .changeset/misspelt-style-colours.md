---
'@mermaid-js/core': patch
'@mermaid-js/diagram-state': patch
---

fix: a misspelt colour in a `style`, `classDef`, `linkStyle` or `todayMarker` statement (`fill:redd`, `fill:#12345`) is ignored with a `STYLE_VALUE_DROPPED` warning and the theme's colour is drawn, instead of black.
