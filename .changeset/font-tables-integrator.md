---
'@mermaid-js/core': minor
'mermaid': minor
---

feat: `initialize({ fontTables })` adds font tables to the table measurer, which measures Node and worker renders and every render under `deterministic: true`. A brand font is then measured as itself, not as Arial, and `deterministic: true` keeps it. The tables load in a chunk of their own with the first `prepare()`, `render()` or `preload()`, which rejects with `MermaidError { code: 'SEMANTIC' }` for a malformed table; `renderSync` before that throws `NOT_LOADED`. `@mermaid-js/core/text/font-tables` exports `createTableMeasurer({ faces })` for the same tables.
