---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders `kanban` boards as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `kanban` diagram. The `kanban` config section is honoured (`sectionWidth`, `padding` as the margin round the board, `ticketBaseUrl` with the link check, `useMaxWidth`); `useWidth` is ignored, and kanban no longer reads the `mindmap` section. Columns take their colour from the `cScale` palette in every theme, cycling past twelve columns; with `@mermaid-js/plugin-hand-drawn`, columns and cards are sketched. The node limit applies to kanban boards. Text output (`format: 'ascii'`) draws the board in cells: columns side by side with their cards stacked inside, the ticket and assignee on a card's last row, and the priority as the card's left edge (a tag in the `ascii` charset). MIGRATION.md lists what differs from v12.
