---
'@mermaid-js/shared': patch
---

feat: first release of `@mermaid-js/shared`, the code several diagram packages share: lexer and parser families, edge drawing, graph layout helpers and ASCII drawing. Each subpath (`@mermaid-js/shared/svg/edges`, `/parser/rule`, …) loads only with the diagrams that import it, so nothing in it lands in the core chunk.
