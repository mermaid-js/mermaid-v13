---
'@mermaid-js/core': patch
---

fix: under the `redux-color`, `redux-dark-color`, `dark` and `neutral` themes, a `cScale<n>` theme variable now also recolours the matching pie slice, as in v12. Under `dark`, the twelfth slice reads `cScale0`, so a `primaryColor` override also recolours it.
