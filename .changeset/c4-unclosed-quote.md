---
'@mermaid-js/diagram-c4': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

fix: a C4 quote left open no longer swallows the next statement. The string stops at the line break before a line that starts a statement, with an `UNCLOSED_STRING` error that names the line, and the statements after it parse. A tab before an opening quote is a blank, and a `"` inside an unquoted argument (as in `"A \"q\" B"`, since C4 text has no escapes) gives a `C4_QUOTE_IN_ARGUMENT` warning (#681).
