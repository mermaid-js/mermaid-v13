---
'@mermaid-js/diagram-block': patch
'@mermaid-js/diagram-c4': patch
'@mermaid-js/diagram-ishikawa': patch
'@mermaid-js/diagram-kanban': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/shared': patch
---

refactor: Block, C4, Ishikawa, Kanban and Venn use shared helpers for text-output lines and trimming, completion lists, label fonts and the source view. `@mermaid-js/shared/ascii` exports `trimmed`. Output is unchanged.
