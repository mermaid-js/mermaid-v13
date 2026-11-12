---
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/language-service': patch
'@mermaid-js/plugin-interactions': patch
---

feat: embedded diagrams. A flowchart or state diagram can hold a whole diagram of any type in a `mermaid <id>["Title"] { … }` block, drawn as one node that edges connect to. Blocks nest up to four levels, fold with `id@{ view: collapsed }` (a folded block is not parsed or loaded), render in text output, and get errors and highlighting in the language service. See `v13/docs/embedded-diagrams.md` and ADR-15.
