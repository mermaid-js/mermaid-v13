---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/diagram-radar': patch
'@mermaid-js/diagram-railroad': patch
'@mermaid-js/diagram-wardley': patch
---

refactor: `@mermaid-js/shared/parser/facet` exports `statementKeyword`, the line-start keyword item that the architecture, radar, railroad and wardley completion tables each built with their own `statement` helper. Completions are unchanged.
