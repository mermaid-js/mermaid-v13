---
'@mermaid-js/language-server': patch
'@mermaid-js/language-service': patch
---

With `mermaid.markdown` on, the language server serves the Mermaid fences in Markdown files (`.md`, `.markdown`, `.mdx`); `mermaid.markdownTokensAndFolding` adds their highlighting and folding, and the language service exports `mermaidFences` (#811).
