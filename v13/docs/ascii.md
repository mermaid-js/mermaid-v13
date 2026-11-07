# ASCII output

Mermaid v13 can render a diagram as plain text instead of SVG: Unicode box drawing by default, or
pure ASCII. Text output runs the same parser and the same layout as SVG, laid out in character
cells instead of pixels, and is drawn by the diagram's own `ascii` entry (DESIGN §6.3, ADR-14).

Only diagram types that declare `ascii` in their manifest support it. In 13.0 those are the
flowchart (`graph` / `flowchart`), the ER diagram (`erDiagram`): entities are boxed tables,
relationships carry their cardinality marks at both ends (`||`, `|o`, `}|`, `}o`), the
sequence diagram (`sequenceDiagram`, [below](#sequence-diagrams)), the kanban board (`kanban`,
[below](#kanban-boards)) and `info`. See [the format matrix](format-matrix.md) for every type.

```
               ┌───◇────┐            ╭─────────╮
┌───────┐      │        ├──── yes ──►│ Ship it │
│ Start ├─────►◇ Ready? ◇            ╰─────────╯
└───────┘      │        ├┄┄┐
               └───◇────┘  ┆
                           ┆
                           ┆         ╓──────╖
                           └┄ no ┄┄┄►║ Wait ║
                                     ╙──────╜
```

from

```mermaid
flowchart LR
  A[Start] --> B{Ready?}
  B -->|yes| C(Ship it)
  B -.->|no| D[[Wait]]
```

## API

Ask for text with `format: 'ascii'` in the render options (D80, R-ASCII-4):

```ts
import mermaid from 'mermaid';

const { text, columns, rows, warnings } = await mermaid.render('id', source, { format: 'ascii' });
```

`render` and `renderSync` return a `TextRenderResult` when `format` is `'ascii'`:

| Field         | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `format`      | Always `'ascii'`, whichever charset was used.                                 |
| `text`        | The drawing. Lines are separated by `\n`, have no trailing spaces, and are byte-stable. |
| `columns`     | Width of the widest line, in terminal cells (a CJK character counts 2).       |
| `rows`        | Number of lines.                                                              |
| `diagramType` | The detected type, as for SVG.                                                |
| `warnings`    | What could not be drawn (see [What gets dropped](#what-gets-dropped)).        |

- The overloads are typed on `format`: SVG calls (no options, `{ format: 'svg' }`, or v12's
  element argument) still return `RenderResult`. With a `format` only known at run time, narrow it
  before the call.
- `render`'s third argument may be an options object or, as in v12, a container element. An `id`
  in the options loses to `render`'s first argument.
- `config` in the options overrides the site config for this call, as for SVG.
- `renderSync(text, { format: 'ascii' })` needs the text entry loaded first. Call
  `await prepare(text, { format: 'ascii' })` (or `render` once). Before that, `renderSync` throws
  `NotLoadedError` for `flowchart/ascii`.
- Check support up front with `supportsFormat(type, 'ascii')`. Asking for text from a type that
  has no text form throws `UnsupportedFormatError` (code `UNSUPPORTED_FORMAT`) from `prepare`,
  `render` and `renderSync`. Mermaid never draws an approximation (D58).
- Syntax and other errors are the same `MermaidError`s as for SVG. There is no text error image.
- The DOM helpers (`run`, `mount`) stay SVG-only.

Text needs no theme and no browser: layout measures in cells with a built-in measurer, so the same
call works in Node, a worker or the browser.

Text output always lays out with the built-in `layered` engine, whatever `layout` says (D179):
no other engine knows cells. A diagram that names another layout (`layout: elk`, `elk.stress`,
the `flowchart-elk` header, a registered engine) is drawn as with `layered`, with one
`ASCII_DROPPED` warning (`feature: 'layout'`). That engine is never loaded for text, and there is
no `ELK_NOT_INSTALLED`, whether `@mermaid-js/layout-elk` is registered or not.

### Extensions

`postParse` and `postLayout` hooks run for text as for SVG. The layout a `postLayout` hook sees
has `units: 'cell'` (SVG: `'px'`), so a hook can tell cell coordinates from pixels. `postRender`
and `afterMount` do not run for text, and there is no text post-processing hook (D86).

## CLI

The `mermaid` package ships a zero-dependency `mermaid` command (D85):

```sh
mermaid render [file|-] --format ascii|svg [--charset unicode|ascii] [--width N|auto] [--warnings]
```

| Option                      | Meaning                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `file` or `-`               | The diagram to read. With no file, or `-`, it reads stdin.                 |
| `--format ascii\|svg`       | Required. `ascii` for text, `svg` for SVG. Output goes to stdout. Any other value is a usage error. |
| `--charset unicode\|ascii`  | Glyph set: Unicode box drawing (`unicode`, the default) or pure ASCII.     |
| `--width N`, `--width auto` | Fit the drawing to `N` columns (`ascii.maxWidth`); `auto` uses the terminal's width (`COLUMNS` off a terminal; no limit when neither is known). |
| `--warnings`                | Print warnings to stderr. Without it they are not printed.                 |
| `-h`, `--help`              | Print usage to stdout and exit 0.                                          |
| `-v`, `--version`           | Print the version to stdout and exit 0.                                    |

`--charset` and `--width` are explicit: each wins over the same key (`ascii.charset`,
`ascii.maxWidth`) set in the diagram's front matter or directives. Keys without a flag, such as
`ascii.padding`, come from the diagram as usual. The precedence, lowest first: defaults, the
diagram's front matter, its directives, the flags. The API offers the same through
`render(id, text, { format: 'ascii', ascii: { … } })`: keys in `ascii` win over every config
source, key by key.

Errors are printed to stderr with the source line and a caret under the problem (R-ERR-2).

| Exit code | When                                                                                   |
| --------- | -------------------------------------------------------------------------------------- |
| 0         | Rendered (or `--help`, `--version`).                                                   |
| 1         | Any error: a usage error (unknown option or command, a `--format` other than `ascii` or `svg`, a bad `--width` or `--charset`), syntax, unknown diagram, unreadable file. |
| 2         | The API's `UNSUPPORTED_FORMAT`: the diagram type has no form in the asked-for format.  |

Of the diagram types built into 13.0, the flowchart, the ER diagram, the sequence diagram and
the kanban board render as SVG and as text; the state diagram has no text form yet, so `--format ascii` on a
`stateDiagram` exits 2 (D58, D100).

No browser is involved: text is measured in cells, and SVG output measures with the built-in
font tables. It is not v12's `mmdc` (which renders through a headless browser) nor the
`mermaid-ascii` binary.

```sh
echo 'graph LR; a --> b' | mermaid render --format ascii
```

## Configuration

The `ascii` section (see [config reference](config-reference.md)). Diagram text may set every key,
in front matter or a directive. Unset keys use the defaults below; they are applied by the text
backend, so SVG renders and their ids do not change.

| Key              | Values                  | Default   | Effect                                                                                                                                                       |
| ---------------- | ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ascii.charset`  | `unicode`, `ascii`      | `unicode` | Glyph set (D79).                                                                                                                                             |
| `ascii.padding`  | `compact`, `roomy`      | `compact` | `compact`: one cell of padding across a label, none down; gaps of 2 between nodes and 4 between ranks. `roomy`: one cell each way and gaps of 5, like mermaid-ascii (D77). |
| `ascii.maxWidth` | integer ≥ 1 (columns)   | none      | Columns to fit. Layout tightens first, then turns `LR` into `TB`. Output is never cropped: if it still does not fit, you get `ASCII_TOO_WIDE` (D84). |

```
---
config:
  ascii:
    charset: ascii
    maxWidth: 60
---
flowchart LR
  a --> b
```

px-valued keys such as `flowchart.nodeSpacing`, `rankSpacing` and `wrappingWidth` still count:
they convert at 8 × 16 px per cell, with minimums (200 px wrapping width → 25 cells). The px
`availableWidth` render option is ignored for text; use `ascii.maxWidth`.

ER is the exception for its size keys (D118): `er.nodeSpacing`, `er.rankSpacing` and
`er.minEntityWidth` convert only when the diagram, a directive or `initialize()` sets them.
v12's px defaults (140, 80, 100) do not convert: text output uses the cell profile's spacing and
fits each box to its text, with a rank gap of at least six cells so both cardinality marks of a
relationship and a line between them fit. `er.entityPadding` and `er.diagramPadding` are SVG
only (D116): cells keep their 1-cell padding and no margin. ER drawings do not yet fit
`ascii.maxWidth`.

## Glyph sets

| Element                     | `unicode`        | `ascii`          |
| --------------------------- | ---------------- | ---------------- |
| Solid line `-->`            | `─ │`            | `- \|`           |
| Dotted line `-.->`          | `┄ ┆`            | `. :`            |
| Thick line `==>`            | `━ ┃`            | `= I`            |
| Corners                     | `┌ ┐ └ ┘`        | `+`              |
| Thick corners               | `┏ ┓ ┗ ┛`        | `+`              |
| Arrowheads (up down left right) | `▲ ▼ ◄ ►`    | `^ v < >`        |
| Circle end `--o`            | `●`              | `o`              |
| Cross end `--x`             | `✕`              | `x`              |
| Edge leaving a box          | `┴ ┬ ┤ ├`        | `+`              |
| Crossings and junctions     | merged: `┼ ┿ ╪ …` | `+`             |

Where lines meet, the glyphs merge into one junction glyph, heavy and dashed lines included
(`─` over `│` is `┼`, `━` over `│` is `┿`). In `ascii` every corner, tee and crossing is `+`.

Text is laid out in terminal cells: East Asian wide and fullwidth characters and emoji take two
cells, combining marks none (D81). Each label line is one row. Markdown bullets are kept (`•` /
`◦`, `-` in `ascii`).

## Shapes

Every node is a box; the shape picks its corners, sides and side marks (D82). Shape delimiters
(`[` `]`, `(` `)`, `{` `}` …) never appear in the label.

| Shape                                              | `unicode`                      | `ascii`                 |
| -------------------------------------------------- | ------------------------------ | ----------------------- |
| rect `[a]`                                         | `┌─┐ └─┘`                      | `+-+`                   |
| rounded `(a)`, stadium `([a])`, circle `((a))`, ellipse | `╭─╮ ╰─╯`                 | `+-+`                   |
| diamond `{a}`                                      | box with `◇` at each side's middle | box with `*`        |
| hexagon `{{a}}`                                    | box with `<` and `>` on the left and right | same       |
| subroutine `[[a]]`                                 | double sides `║ ║`             | `I I`                   |
| cylinder `[(a)]`                                   | `═` top and bottom             | `=` top and bottom      |
| collapsed subgraph                                 | box with a `+` marker          | same                    |
| image, icon                                        | box with the label (asset dropped) | same                |
| any other shape                                    | plain box, `ASCII_SHAPE` warning | same                  |

Where an edge leaves a diamond at a side mark, the tee replaces the mark.

Subgraphs are frames with the title on the top border (`┌─ build ──┐`). Nested subgraphs nest.
An empty subgraph is drawn as an empty frame. A front-matter `title` is printed centred on the
first line.

## Sequence diagrams

The sequence diagram's text entry (`@mermaid-js/diagram-sequence/ascii`, D100) draws the same
layout as SVG, computed in cells (D108): one layout function, its lengths from a `cell` column
of the sequence metrics table.

```
  ┌───┐             ┌───┐
  │ A │             │ B │
  └─┬─┘             └─┬─┘
    ┆                 ┆
    ┆    request      ┆
    ├────────────────►┆
┌───┼ alt ────────────┼───┐
│   ┆      [is valid] ┆   │
│   ┆                 ┆   │
│   ┆    success      ┆   │
│   ┆◄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤   │
├┄┄┄┼┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┼┄┄┄┤
│   ┆  [is invalid]   ┆   │
│   ┆                 ┆   │
│   ┆     error       ┆   │
│   ┆◄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤   │
└───┼─────────────────┼───┘
    ┆                 ┆
  ┌─┴─┐             ┌─┴─┐
  │ A │             │ B │
  └───┘             └───┘
```

from

```mermaid
sequenceDiagram
  A->>B: request
  alt is valid
    B-->>A: success
  else is invalid
    B-->>A: error
  end
```

- Participants are boxes that fit their label, mirrored at the bottom as in SVG
  (`mirrorActors`). An `actor` has rounded corners and a `database` double top and bottom;
  the other symbols (boundary, control, entity, collections, queue) are plain boxes, named in
  one `ASCII_SHAPE` warning.
- Lifelines are dashed (`┆`, `:`). An activation draws its lifeline heavy (`┃`, `I`); a nested
  one is one column to the right.
- Message lines are solid or dotted and start at a tee on the sender's lifeline. Heads:
  `►` `◄` (`>` `<`) for `->>`, `✕` (`x`) for `-x`, `)` `(` for the async `-)`, harpoons
  `⇀` `⇁` `↼` `↽` for the half arrows, none for `->`. ASCII has no half heads: it draws
  them as `>` `<` and says so in one `ASCII_SHAPE` warning (`half-arrowhead`). A
  bidirectional arrow has a head at each end, a central connection `()` a circle (`●`, `o`)
  on the lifeline.
- A self message loops out right of its lifeline, its label beside it; a central circle sits
  where it leaves (`A()->>A`) or comes back (`A->>()A`). Every loop is square, so
  `sequence.rightAngles` changes nothing in text.
- Each line of a label is aligned as `sequence.messageAlign` / `noteAlign` say.
- Labels keep off the sides of a `box` group: a box grows to hold its members' self messages
  and notes, and a message label that would cross a side moves along its line to clear it.
- Notes are boxes; one over two participants fits its text. A fragment is a frame with its
  keyword on the top border (on the first stretch where no lifeline crosses it), its
  condition on the row below in brackets, and a dashed divider (`├┄┄┤`) before each `else`, `and` or
  `option`. A `box` group is a frame with its title on the top border.
- With `autonumber`, each label starts with its number (`1. Hello`), and the layout makes
  room for it.
- A `title` statement is centred above the drawing; without one, the front-matter title is.
- Dropped, one `ASCII_DROPPED` warning per kind: `style` (`box` colours and `rect`
  highlighting, which leaves no trace), `emphasis` (bold and italic text, and a bold
  `sequence.*FontWeight`), `link` (actor menus: `link`, `links`, `properties`,
  `details`) and `accessibility` (`accTitle`, `accDescr`).

`sequence.*` px config keys convert to cells as for the flowchart (8 × 16 px per cell): set
`sequence.width` to 120 and boxes are at least 15 columns wide. Wrapped text (`wrap`) wraps
to at least 19 columns.

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
  tells the four apart: `+- !! ---+` (`Very High`), `!`, `-`, `--` (`Very Low`). Any other
  priority draws a plain edge and warns `KANBAN_PRIORITY`, as in SVG.
- A board wider than `ascii.maxWidth` is not folded: it is drawn whole, with `ASCII_TOO_WIDE`.
- Dropped, one `ASCII_DROPPED` warning per kind: `style` (`:::` classes), `emphasis` (bold and
  italic text) and `link` (ticket links from `kanban.ticketBaseUrl`). Column colours come from
  the theme and are dropped silently; icons are drawn by neither output.

## What gets dropped

Text output is plain: no colour. Features with no text form are left out, with **one**
`ASCII_DROPPED` warning per kind. Each warning has `feature` and `astIds`, the AST ids of the
elements and statements involved, so an editor can point at them (D82, R-ASCII-5).

| `feature`       | What is dropped                                                  |
| --------------- | ---------------------------------------------------------------- |
| `style`         | Colours and styles: `style`, `classDef`, `class`, `linkStyle`.   |
| `curve`         | Edge curves; edges are always drawn as straight, stepped lines. |
| `image`         | Images and icon shapes; the label is kept.                       |
| `icon`          | Label icons (`fa:fa-car`), shown as written ([Icons](icons.md)). |
| `emphasis`      | Bold and italic text.                                            |
| `link`          | `click` links, tooltips and callbacks.                           |
| `accessibility` | `accTitle` and `accDescr`.                                       |

The other text warnings (`ASCII_SHAPE` is D82's; `ASCII_ROUTE` comes from the repair router, D78):

| Code             | Fields            | When                                                                     |
| ---------------- | ----------------- | ------------------------------------------------------------------------ |
| `ASCII_SHAPE`    | `shapes`, `astIds` | Nodes with a shape that has no text form, drawn as plain boxes.          |
| `ASCII_ROUTE`    | `astIds`          | An edge the router could not give a free lane; it may touch another line or text (D78). |
| `ASCII_TOO_WIDE` |                   | The drawing is wider than `ascii.maxWidth` after fitting (D84).          |

## Size

The text entry is loaded only when text is asked for: an SVG render never fetches it. `core/ascii`
plus one diagram type's text entry (the flowchart's, the ER diagram's, the sequence diagram's, the kanban board's or info's)
have their own budget of 15 KB gzip, East Asian width data included, outside the 80 KB R-PERF-1
budget for SVG (D87, R-ASCII-9). The 15 KB budget is soft: the bench's `ascii-size` gate measures
each type's text path and reports the largest (D130), but never fails. That an SVG render loads
no ascii module is a hard check (`packages/bench/src/ascii-size.spec.ts` in `pnpm test`).
