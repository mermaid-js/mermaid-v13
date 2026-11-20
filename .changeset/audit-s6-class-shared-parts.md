---
'@mermaid-js/core': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/plugin-interactions': patch
---

refactor: `@mermaid-js/core/parser-kit` exports `callbackArgs`, which class diagrams and the interactions plugin now share; class, ER and requirement warnings use core's `Warning`, so the `ClassWarning`, `ErWarning` and `RequirementLayoutWarning` types are gone. Output is unchanged.
