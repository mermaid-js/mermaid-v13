---
'@mermaid-js/language-server': patch
---

feat: first release of `@mermaid-js/language-server`, the Mermaid language service over LSP (stdio, `mermaid-language-server` bin) for `.mmd` and `.mermaid` files: diagnostics, definition, references, rename, hover, completion, folding and semantic tokens. Third-party diagram facets load only when the client opts in with `initializationOptions.mermaid.plugins: true`.
