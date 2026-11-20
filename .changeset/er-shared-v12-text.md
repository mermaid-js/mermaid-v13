---
'@mermaid-js/diagram-er': patch
---

refactor(er): the ER parser now gets the text v12's lexer saw from the shared v12 text, instead of building it again. Output, diagnostics and token ranges are unchanged.
