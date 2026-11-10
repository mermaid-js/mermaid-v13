## Block diagram

- **Syntax** is v12's (the grammar is in [syntax/block.md](./syntax/block.md)): line breaks
  separate nothing, ids take `;`, `,`, `.`, `|`, `%`, `#` and Unicode, labels are quoted, and
  every error is reported, not only the first, with messages in words (R-PARSE-4). What v12
  rejected is still rejected, except `style` (below).
- **Edge chains** (D442): `a --> b --> c` declares `a`, `b` and `c` and draws both edges. v12
  dropped `a`, `b` and the first edge and drew a block `undefined`.
- **`class` before its block** (D442) gives the block the class, and the block is drawn. v12
  made a hidden block of the id, so the later declaration was never placed.
- **`class a, b`** (D442) gives `b` the class too: the ids are trimmed. v12 looked up ` b` and
  drew `b` without the class.
- **`root`** (D442) is an ordinary block id. v12 merged it into its own top level and drew
  nothing for it.
- **A leaf later opened as `block:a … end`** (D442) keeps its place and holds the children.
  v12 lost the children.
- **A composite opened a second time** keeps both bodies: the second adds to the first. v12 lost
  the second body's new blocks. Pending a D-id (D440).
- **A chain in a composite header**, `block:a --> b … end`: the composite is `a`, and the edge
  and `b` stand next to it. v12 drew a composite with no id and lost the edge. Pending a D-id
  (D440).
- **`style`** (D443) applies after every statement, so `style a …` before `a` and
  `style a,b …` work; ids that never appear get one `BLOCK_STYLE_UNKNOWN` warning. v12 threw a
  TypeError and rejected the diagram.
- **Degenerate sizes** (D445). `columns 0` lays out as `columns auto` and a span `:0` as `:1`,
  with one `BLOCK_SIZE_INVALID` warning (v12 threw or drew NaN). Spans are capped at 1,000
  columns and `space:n` at 100,000 cells, with one `BLOCK_TRUNCATED` warning; v12 kept larger
  ones, and rejected a spacer over 16,777,214 cells (`Map maximum size exceeded`), which v13
  now accepts. Block-arrow directions are trimmed, so `( right , left )` draws (v12 drew no
  arrow).
- **Generated ids** of spaces and anonymous composites are `id-1`, `id-2`, … in source order,
  where v12 drew random ones (R-ARCH-6).
- **Self-loops and parallel edges** (D441): edges stay v12's straight segments between the
  centres, clipped at the outlines, and parallel edges still overlap; a self-loop (`a --> a`),
  which v12 drew with zero length, is an arc standing out at the block's top right.
- **Composite labels** (D444): `block:g["Title"] … end` reserves a band above the composite's
  grid for its label, so the label no longer sits under the children; an unlabelled composite
  is laid out as in v12.
- **Config** (the `block` section): `padding` (default 8: the grid gap and inset, and a leaf's
  label padding) and `useMaxWidth` are honoured. A `padding` that is not a finite number of 0 or
  more (`-3`, `"x"`, `"20"`) lays out at 8, and one over 1,000 at 1,000, each with one
  `BLOCK_CONFIG_INVALID` warning (D226, D445); v12 laid it out as it was (a string was
  concatenated into the sizes, `1e9` drew a viewBox about 1e9 wide). A block-scoped `theme`
  wins over the top level, as in 12.2.0. `useWidth` and `layout` are ignored, as v12's block
  renderer never read them (block lays out its own grid). `look` is removed (D153): ignored with one
  `LOOK_REMOVED` warning; the redux and `neo` families carry the gradient, shadow and neo
  paddings.
- **Text output** (new, D449): `format: 'ascii'` draws block diagrams as text from the lazily
  loaded `@mermaid-js/diagram-block/ascii` entry: boxes on a character grid, composites as
  frames, edges as stepped lines. `block.padding` is ignored there, with no warning. See
  [ASCII output](../ascii.md#block-diagrams).

## Block SVG structure

What changed in the block diagram's SVG compared with v12 (spec #521). v12's classes are kept,
and its block order: `g.block` holds every block in pre-order (a composite before its children),
each a `g.node` (`node <classes or default> flowchart-label`) holding its shape as
`label-container` (a composite's is `rect.basic.cluster.composite.label-container`) and its
`g.label`; then the edges as `path.flowchart-link` with `edge-thickness-*` and
`edge-pattern-*`; then the edge labels as `g.edgeLabel` (a change of order, below).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, a `<style>` scoped by the id (shape, edge, label and palette rules) | No root `id`; `class="mermaid mermaid-block"`, `role="img"`, `aria-roledescription="block"` (kept), `data-mermaid-version`. No `<style>` (except `theme: 'auto'`'s variables-only sheet): fills, strokes and widths are presentation attributes reading `var(--_x)` aliases on the root `style` | R-SEC-2, R-THEME-3 |
| `<defs>` with `<marker>`s (point, circle, cross) referenced by `marker-start`/`marker-end`, and for `look: neo` a gradient and a drop-shadow `<filter>` | Arrowheads drawn inline after their edge (`path.marker`, `circle.marker`); the drop shadow is the theme's `dropShadow` as a `filter` attribute; the gradient is core's one scoped `<linearGradient>` (`<id>-gradient`), on outlines only | DESIGN §7.1, D182 |
| Ids on every block (`<render id>-<id>`) and edge (`<render id>-<k>-<a>-<b>`) | No ids: `data-id` (the block's id, the edge's `<k>-<a>-<b>`) on each `g.node`, edge `path`, `g.label` and `g.edgeLabel`; `data-ast` on each `g.node` and edge `path` only | R-ARCH-6, R-PARSE-8, pitfall 12 |
| Labels: `g.label` > `foreignObject` > HTML `span` | `g.label` > `text`/`tspan` from core's label layout; markdown strings stay rejected (syntax) | R-SEC-2 |
| Every block wrote a `g.label`, an unlabelled composite's empty (`labelHelper`) | An unlabelled composite has no `g.label` | Nothing invisible is drawn |
| A composite's label at its centre | In its band above the grid (`padding`, then the label) | D444 |
| A block arrow's polygon `label-container`, as a leaf polygon's | `label-container block-arrow`, so a hand-drawn drawer and a stylesheet can tell the two apart | D447 |
| Edge classes `… flowchart-link LS-a1 LE-b1` (fixed, meaningless `LS`/`LE`) | `edge-thickness-* edge-pattern-* flowchart-link` | Dead classes dropped |
| Edges from centre to centre, clipped at the outline v12's intersect found (the crossing nearest the far end) | Clipped at the outermost crossing of each outline; a self-loop is a cubic standing out at the top right | D441 |
| Edge label `g.edgeLabel` > `g.label` > `foreignObject`, a background at `edgeLabelBackground` | `g.edgeLabel` > its background `rect` (`edgeLabelBackground`) and its `text` | R-SEC-2 |
| Each edge label drawn straight after its edge (`insertEdges`), so a later edge could cross it | Every edge first, then every edge label, so no edge crosses a label | As flowchart v13 (one family, user story 6) |
| Arrowheads painted `lineColor` (block's `.marker` rule) | Painted `arrowheadColor`, as flowchart v13: the same colour in every theme but `forest` and `neutral`, which set their own | One family with flowchart |
| Composite palette in CSS (`[data-look][data-color-id="color-i"].node rect.composite`), only in `redux-color` and `redux-dark-color` | `data-color-id="color-<n>"` on the composite's `g.node` (kept) with the slot's stroke and fill on its `rect`, wherever the theme or the author sets `borderColorArray`; `style`/`classDef` still beat it | D152, `paletteSlots()` |
| `data-look` on nodes; `look: neo` drew the gradient and shadow | No `data-look`: `look` is ignored (`LOOK_REMOVED`); the redux and `neo` families carry the gradient and shadow, on leaves, block arrows and composites, never on edges or labels | D153, D181, D227 |
| Edge line ends: the SVG default butt caps | Round caps on solid edges, butt on dotted ones (round caps would close a 2 px dash's gaps); widths as v12 (`strokeWidth`, thick 3.5, dotted dashed `2`) | As flowchart v13 |
| `classDef` text styles applied by CSS (`color` rewritten to `fill`) | A class's or `style`'s `color` is the label's `fill`; a styled `fill` gives the label the matching ink | As flowchart v13 |
| A double circle grew with its cell (both rings stretched to the cell's width) | Drawn at its natural size, centred in its cell, as the circle and the diamond are | Spec #521 (GAPS T3) |
| Composites nested 5 or more levels deep sized as v12's repeated sizing compounded (a block at depth d sized 2^d times) | Each composite is sized at most 16 times, so the layout stays linear: v12's sizes exactly to 4 levels; at 5 levels 97 of 300 generated trees differ (median 544 px, at most 27,405 px), at 6 levels 32 of 100 (median 2,496 px, at most 53,192 px) | Linear layout; past the cap pending a D-id (D440) |
| The `viewBox` from the browser's `getBBox()` plus 5, and a height one "magic factor" taller | The layout's bounds (every outline, label and edge, plus v12's 5 px) | D224 |
| No text output | `format: 'ascii'` (both charsets): boxes on a character grid, one width per column at the widest label, composites as frames with the label on the top border, spaces blank, labels cut with `…`, block arrows as boxes with an arrowhead per pointing side, edges as stepped lines with arrowheads; `block.padding` ignored with no warning | D449, D320 |
| Hand-drawn: leaves sketched by roughjs | Leaves through the outline hook (`node`, and `divider` for the subroutine's frames, the cylinder's rim and the double circle's inner ring); composites, block arrows and edges plain, as v12 | D301, D302, D447 |
