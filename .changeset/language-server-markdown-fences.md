---
'@mermaid-js/language-server': patch
'@mermaid-js/language-service': patch
---

feat: on opt-in (`initializationOptions.mermaid.markdown`), the language server serves the Mermaid fences of Markdown documents (`.md`, `.markdown`, `.mdx`, language id `markdown` or `mdx`): every feature works inside a fence, at Markdown positions, and nothing answers outside one. Semantic tokens and folding of a Markdown document come only with `mermaid.markdownTokensAndFolding`. The language service exports `mermaidFences`, the fence finder the server uses (#811).
