---
'@mermaid-js/core': patch
'@mermaid-js/diagram-kanban': patch
---

feat: core's `layoutLabel` takes `keepWords` (off by default), which keeps a word wider than the wrap width whole on a line of its own, its full width in the label's box. Kanban uses it in SVG, so a column title, card title, ticket or assignee word wider than its column or card overflows as in v12 instead of being split between characters; the text output still splits it.
