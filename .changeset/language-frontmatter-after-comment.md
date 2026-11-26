---
'@mermaid-js/language-service': patch
'@mermaid-js/language-service-monaco': patch
---

fix: `%%` comment and `%%{init}%%` directive lines above the `---` front matter are coloured, and the Monaco highlighter still finds the diagram type after them.
