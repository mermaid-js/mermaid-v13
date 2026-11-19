---
'@mermaid-js/diagram-c4': patch
---

fix: c4-beta `style` checks its colours: a word that is not a CSS colour name (`fill:lightgren`) is dropped with `C4_COLOR_INVALID` and the theme colour drawn instead of black, `#rgba`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()` and `hsla()` are drawn, a value that cannot be read drops only its `style` line with a warning, and `C4BETA_STYLE_IGNORED` says what each key takes.
