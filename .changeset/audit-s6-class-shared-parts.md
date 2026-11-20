---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/plugin-interactions': patch
---

refactor: class diagrams and the interactions plugin share one `callbackArgs` (`@mermaid-js/shared/parser/callback`), so the plugin now takes `@mermaid-js/shared` as a peer; class, ER and requirement warnings use core's `Warning`, so the `ClassWarning`, `ErWarning` and `RequirementLayoutWarning` types are gone. Output is unchanged.
