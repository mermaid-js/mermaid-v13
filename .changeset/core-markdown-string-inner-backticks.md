---
'@mermaid-js/core': patch
---

fix: a label that starts and ends with a backtick but holds more backticks, such as `` `npm` or `pnpm` ``, is no longer read as one markdown string; it is drawn as written.
