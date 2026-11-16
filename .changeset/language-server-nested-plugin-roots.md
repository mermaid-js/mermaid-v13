---
'@mermaid-js/language-server': patch
---

With plugins on, the language server also finds plugins installed in a nested workspace package (`packages/foo/node_modules` in a pnpm workspace) once you open a file there (#172).
