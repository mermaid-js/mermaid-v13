---
'@mermaid-js/core': patch
---

fix: theme opacity variables such as `pieOpacity` take a percentage (`"50%"`), as v12 did, instead of dropping it with a warning.
