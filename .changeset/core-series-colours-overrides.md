---
'@mermaid-js/core': patch
---

fix: pie slices and journey sections respond to a `primaryColor`, `secondaryColor` or `tertiaryColor` override as in v12: journey's sections follow the override in every classic theme, forest's and base's later pie slices are recomputed from it, and the default theme's pie keeps its own colours.
