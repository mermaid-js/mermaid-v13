---
'@mermaid-js/core': patch
---

fix: a `%%` comment or `%%{init}%%` directive line above the `---` front matter no longer fails every diagram; the front matter is read and its title and config apply.
