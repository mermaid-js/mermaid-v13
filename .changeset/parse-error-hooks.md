---
'mermaid': patch
---

fix: `mermaid.parseError = fn` works again, as in v12, and the parse error handler (`parseError` or `setParseErrorHandler`) is now also called when `render()` fails, with the `MermaidError` it rejects with.
