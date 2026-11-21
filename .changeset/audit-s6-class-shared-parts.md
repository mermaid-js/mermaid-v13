---
'@mermaid-js/core': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/plugin-interactions': patch
---

refactor: `@mermaid-js/core/parser-kit` exports `callbackArgs`, which class diagrams and the interactions plugin now share. `@mermaid-js/diagram-class` no longer exports the `ClassWarning` type and `@mermaid-js/diagram-requirement` no longer exports `RequirementLayoutWarning`: use `Warning` from `@mermaid-js/core`, which has every field they had. Output is unchanged.
