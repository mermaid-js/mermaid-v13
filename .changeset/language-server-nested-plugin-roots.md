---
'@mermaid-js/language-server': patch
---

feat: with plugins on, the language server also scans the nearest package root above each opened document inside a workspace folder, once per session, so a plugin installed in a nested pnpm workspace package (`packages/foo/node_modules`) is found; new facets re-publish the open documents' diagnostics (#172).
