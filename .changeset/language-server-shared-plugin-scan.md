---
'@mermaid-js/language-server': patch
'mermaid': patch
---

fix: with plugins on, the language server finds third-party diagram facets with the same scan `mermaid` renders with in Node (`mermaid/node-scan`), so a plugin package is accepted or skipped alike by both: a module named `..name.js` is found, an invalid manifest id is skipped, and of two packages with one id the first by package name wins. A client that names no workspace folder gets first-party types only and one log line; the server no longer scans its working directory. `mermaid/node-scan` adds `packageModule`, which confines a manifest path the scan does not read itself (#808).
