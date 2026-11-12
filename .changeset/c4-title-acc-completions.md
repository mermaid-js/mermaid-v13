---
'@mermaid-js/diagram-c4': patch
---

fix: C4 completion offers `title`, `accTitle:` and `accDescr:` where a statement starts, after the macros. They are not offered as a boundary's first statement, where the parser takes none.
