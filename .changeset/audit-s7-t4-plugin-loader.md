---
'@mermaid-js/plugin-autoload': patch
'@mermaid-js/bundler-plugin': patch
'@mermaid-js/language-server': patch
---

refactor: the language server loads a plugin's detector and language module with `@mermaid-js/plugin-autoload`'s loader, which now exports `detectorOf`, `importWithin` and `IMPORT_TIMEOUT_MS`, so its timed imports no longer keep the process alive while they wait. The bundler plugin drops a branch the scan never reaches. Discovery results are unchanged.
