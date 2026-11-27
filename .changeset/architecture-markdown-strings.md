---
'@mermaid-js/diagram-architecture': patch
---

fix: an architecture label wholly in backticks (``"`**bold**`"``) is drawn as Markdown without its backticks; any other label is plain, so `**x**` without backticks now stays as written, while `<br>` and `<b>`/`<i>` still work.
