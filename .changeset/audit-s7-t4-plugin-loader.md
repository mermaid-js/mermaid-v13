---
'@mermaid-js/plugin-autoload': patch
'@mermaid-js/bundler-plugin': patch
'@mermaid-js/language-server': patch
---

refactor: the bundler plugin and the language server load a plugin's detector with `@mermaid-js/plugin-autoload`'s loader, which now exports `detectorOf`, `importWithin` and `IMPORT_TIMEOUT_MS`. The language server's timed imports no longer keep the process alive while they wait. Discovery results are unchanged.
