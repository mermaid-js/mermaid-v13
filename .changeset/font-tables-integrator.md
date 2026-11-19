---
'@mermaid-js/core': minor
'mermaid': minor
---

feat: `initialize({ fontTables })` adds font tables to the table measurer, which measures Node and worker renders and every render under `deterministic: true`. A brand font is then measured as itself, not as Arial, and `deterministic: true` keeps it. Core exports `createTableMeasurer({ faces })` for the same tables. A malformed table throws `MermaidError { code: 'SEMANTIC' }` from `initialize()`.
