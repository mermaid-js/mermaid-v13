---
'@mermaid-js/diagram-c4': patch
---

refactor: the C4 and c4-beta parsers now hand out their AST ids (`element:a`, `element:a@2`, …) through one shared counter instead of two copies. Ids are unchanged.
