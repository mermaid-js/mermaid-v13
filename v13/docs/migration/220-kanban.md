## Kanban

- **Detection:** `kanban` is detected by v12's case-sensitive detector with no word boundary,
  between `c4` and `classDiagram` as in v12. So `kanbanBoard` or `kanbanx` is detected as a
  kanban board and then rejected as a syntax error (`SYNTAX`), and `Kanban` or `KANBAN` is not
  detected at all (`UNSUPPORTED_DIAGRAM`), as in v12. The language service, CodeMirror and
  Monaco know it.
- **Text output** (`format: 'ascii'`, new; v12 had none) draws the columns side by side as boxes,
  `sectionWidth` in cells wide (200 px is 25 columns), with each column's title on its top
  border and its cards stacked inside, labels wrapped to the card. A card's last row has the
  ticket on the left (plain text, never a link) and the assignee on the right, or each on a row
  of its own when they do not fit side by side. The priority is the card's left edge: heavy
  for `Very High` and `High`, dashed for `Low` and `Very Low`; in the `ascii` charset a tag on
  the card's top border (`[!!]`, `[!]`, `[-]`, `[--]`) tells the four apart. `:::` classes, bold and
  italic text and ticket links are dropped with one `ASCII_DROPPED` warning each (`style`,
  `emphasis`, `link`); a board wider than `ascii.maxWidth` is not folded and adds
  `ASCII_TOO_WIDE` ([ASCII output](./ascii.md#kanban-boards)).
- **Syntax** is v12's: a differential test runs v12 and v13 over every e2e fixture and the v12
  spec and docs examples, and the grammar is in [syntax/kanban.md](./syntax/kanban.md). Every
  error is reported, not only the first, with messages in words (R-PARSE-4). As in v12, an item
  indented less than the first column is an error once another item follows it (the message
  starts with v12's `Items without section detected`), and so is an item whose text starts with
  the word `kanban` in any case. Errors v12 raised as a `TypeError` or not at all are now
  diagnostics with a range: an `::icon()` or `:::` line before any item, shape data that is
  empty or `null` (`@{ }`), and a `shape` that is not a lower-case string (`shape: 5`).
- **Columns that share an id** (D373): v12 listed the cards of every column with that id under
  each of them, so two `docs` columns both drew both columns' cards. A card now belongs to the
  column it follows. Repeated ids are allowed for columns and cards alike.
- **Labels** (D372) are SVG text from core's label layout, measured in the theme's font, instead
  of HTML in `<foreignObject>`: `<br>`, the drawn tags, entities, math and `fa:` icons work in
  column titles, card titles, tickets and assignees. Column titles wrap at `sectionWidth` and card
  labels 25 px inside it, as in v12; a single word wider than that stays whole and overflows the
  column or card, as in v12 (earlier v13 builds split it between characters; the text output
  still does, to keep it in its box). A raw line break inside a quoted label breaks the line,
  as in v12, whose markdown labels turned it into a `<br>` (D641).
- **Markdown only in markdown strings** (D710, D712). v12 read every label as Markdown, so
  `**bold**` and `*italic*` drew bold and italic without backticks. Now only a label wholly in
  backticks (`` ["`**bold** card`"] ``, `` assigned: '`**md**`' ``) is read as Markdown; in any
  other label `**bold**` is drawn as written. Wrap the label in `` "`…`" `` to keep the old
  look. Inline code and list syntax (``Use `npm ci` first``, `- not a list`, `1. step`) are
  drawn as written, as v12 drew them; earlier v13 builds drew them as code and list items.
- **Metadata v12 parsed but never drew is still not drawn** (D376), with no warning: an item's
  icon (`::icon()` or `@{ icon }`), and a column's `ticket`, `assigned` and `priority`. It stays
  in the model and the AST.
- **Priority** (D375): `Very High`, `High`, `Low` and `Very Low`, matched exactly, draw v12's
  bar in `red`, `orange`, `blue` and `lightblue` in every theme. Anything else draws no bar
  (v12 drew one with no stroke), and one `KANBAN_PRIORITY` warning per render names the card
  values that are none of those four nor `Medium`.
- **Ticket and assignee** (D647): a card's ticket and assignee that do not fit side by side
  are drawn on two rows, the assignee under the ticket and still right-aligned, and the card
  grows to hold them, as the text output does. v12 drew them on one row whatever their widths,
  so long ones were drawn over each other. A pair that fits keeps v12's row and card height
  ([Kanban SVG structure](#kanban-svg-structure)).
- **Ticket links** (D377) pass the link check, and a refused URL draws the ticket as plain text
  with a `URL_REFUSED` warning; the first `#TICKET#` is replaced with the ticket taken literally
  ([Kanban SVG structure](#kanban-svg-structure)). The ticket and assignee follow the label
  rule, so a tag the ticket draws as formatting is left out of its link: `<b>T-1</b>` draws a
  bold `T-1` and links to `…T-1`, where v12 put the tags in the URL (D712).
- **Column colours** (D374) come from the `cScale` palette in every theme, lightened by 10 or
  darkened under a dark theme, and cycle through the twelve slots, so v12's black columns past
  the tenth are gone and `neo-dark` darkens where v12 left it light
  ([Kanban SVG structure](#kanban-svg-structure)).
- **Config** (D378). The `kanban` section is honoured with v12's defaults: `sectionWidth` (200),
  `padding` (8), `ticketBaseUrl` (empty, so no links) and `useMaxWidth` (true); `kanban.theme`
  wins over the top-level `theme` for kanban boards. v12's kanban read three `mindmap` keys:
  `mindmap.padding` (10) as its margin, `mindmap.useMaxWidth`, and `mindmap.maxNodeWidth` (in
  its DB), and it never read `kanban.padding` or `kanban.useMaxWidth`. v13 reads the `kanban`
  keys and none of the three `mindmap` keys, so the default margin round a board is 2 px
  tighter on each side, and a `mindmap` setting no longer changes a board. `sectionWidth: 0` is 200, as v12's `sectionWidth || 200`. Numeric
  strings (`"300"`, not `"300px"`) are read as numbers, as in v12. A `sectionWidth` above 0 and
  below 26 is raised to 26, where v12 drew cards of negative width, and a value that is not a
  number from 0 to 10,000 lays out with the default; each warns `KANBAN_CONFIG_IGNORED`.
  `useWidth` is ignored (v12 never read it), and `look` is ignored as everywhere (D153), except
  that `look: handDrawn` sketches the board when `@mermaid-js/plugin-hand-drawn` is installed.
- **Hand-drawn** (D379): columns and cards are sketched. v12 sketched columns only (cards never
  got the look), and its card code would have dropped the priority bar; v13 keeps the bar
  ([Hand-drawn look](#hand-drawn-look)).
- **Limits** (R-SEC-5): a board may have up to `limits.maxNodes` items, columns and cards
  together (10,000); over it, render rejects with a `LIMIT` `MermaidError`. v12 had no such
  limit. Only the integrator can raise it ([Limits](#limits)).
