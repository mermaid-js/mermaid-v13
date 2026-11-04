---
'@mermaid-js/language-service': patch
---

feat: first release of `@mermaid-js/language-service`, the editor-agnostic Mermaid language service: `createLanguageService()`, `await service.preload()`, and immutable document snapshots with diagnostics, definition, references, rename, hover, completion (front-matter config included), folding, semantic tokens and `astAt`/`rangeOf`. Ships the line helpers every editor adapter shares and the golden runner for facet authors as `@mermaid-js/language-service/testing`.
