---
intro: "the kanban board (`kanban`, [below](#kanban-boards))"
cli: "the kanban board"
size: "the kanban board's"
---

## Kanban boards

The kanban board's text entry (`@mermaid-js/diagram-kanban/ascii`, #466, D320) draws the same
layout as SVG, computed in cells: one layout function, its lengths from a cell table of the
kanban metrics (`KANBAN_CELL_METRICS`), with `kanban.sectionWidth` converted to cells (200 px
is 25 columns).

```
┌──────── Todo ─────────┐ ┌──────── Done ─────────┐
│ ┎───────────────────┐ │ │                       │
│ ┃ Write the docs    │ │ └───────────────────────┘
│ ┃ MC-1         knsv │ │
│ ┖───────────────────┘ │
│ ┌───────────────────┐ │
│ │ Blog post         │ │
│ └───────────────────┘ │
└───────────────────────┘
```

- Columns are boxes side by side, one column apart, each `sectionWidth` wide, with its title
  centred on the top border; a longer title wraps and its later lines sit inside the box.
- Cards are boxes stacked inside their column, one column in from its sides. Titles, tickets and
  assignees wrap at the card's width less a space either side.
- A card's last row has the ticket on the left, as plain text (never a link), and the assignee
  on the right; when they do not fit side by side each takes a row of its own.
- The priority is the card's left edge: heavy (`┃`, `I`) for `Very High` and `High`, dashed
  (`┆`, `:`) for `Low` and `Very Low`. In the `ascii` charset a tag on the card's top border
  tells the four apart: `+-[!!]---+` (`Very High`), `[!]`, `[-]`, `[--]` (`Very Low`). Any other
  priority draws a plain edge and warns `KANBAN_PRIORITY`, as in SVG.
- A board wider than `ascii.maxWidth` is not folded: it is drawn whole, with `ASCII_TOO_WIDE`.
- Dropped, one `ASCII_DROPPED` warning per kind: `style` (`:::` classes), `emphasis` (bold and
  italic text) and `link` (ticket links from `kanban.ticketBaseUrl`). Column colours come from
  the theme and are dropped silently; icons are drawn by neither output.
