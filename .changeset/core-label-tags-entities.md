---
'@mermaid-js/core': patch
---

fix: labels draw `<u>`/`<ins>` underlined, `<s>`/`<strike>`/`<del>` struck through and `<sub>`/`<sup>` as sub- and superscript, decode entity codes without `;` as HTML does (`&lt` draws `<`), and `markdownString` from `@mermaid-js/core/text` recognises a markdown string.
