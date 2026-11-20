---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-class': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-state': patch
---

refactor: ER, class and state completions and hover read their `direction` meanings from one shared table, which the flowchart family's table is built from too; the text is unchanged.
