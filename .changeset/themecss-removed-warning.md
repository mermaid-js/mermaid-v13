---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: setting `themeCSS` now gives a `CONFIG_REMOVED_KEY` warning that names its replacement (`themeVariables`, or `--mermaid-*` CSS variables). Before, it was ignored without a warning.
