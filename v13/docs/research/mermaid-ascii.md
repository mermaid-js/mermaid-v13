# mermaid-ascii — research notes for Mermaid v13

Source: `/Users/knsv/repos/mermaid-ascii` (read-only), `github.com/AlexanderGrooff/mermaid-ascii`,
HEAD `5a9df15`. Paths below are relative to that repo.

## TL;DR

- **Language:** Go 1.21, a single static binary (`main.go` → `cmd/root.go`, cobra). There is also a
  `web` subcommand (gin HTTP server plus `templates/index.tmpl`). Packaging covers goreleaser, Nix,
  Docker, and a PKGBUILD. There is no WASM or JS build.
- **License:** MIT, © 2023 Alexander Grooff (`LICENSE`).
- **Size:** about 8k lines of non-test Go and about 5k lines of tests, plus about 330 golden
  fixtures.
- **Diagram types:** flowchart/graph, sequence, and ER (erDiagram). Nothing else.
- **Parser:** its own, line-oriented and **regex-based** (37 `regexp.MustCompile` across the three
  parsers). It shares nothing with Mermaid's grammars, so it accepts a subset and is lenient (an
  unparseable line becomes a node).
- **Layout:** a separate **grid/character-cell layout per diagram type**, designed for the
  terminal.
  - Graph: a greedy level-by-level grid placement, then A* orthogonal edge routing on the grid.
  - Sequence: a linear column-per-participant layout.
  - ER: a near-square grid of entity tables with one routing lane per relationship.
- **Pluggability into v13:** it cannot reuse a pixel-space layout model as it stands, because all
  three layouts are integer cell-grid algorithms. Two realistic paths exist (see §6):
  - (a) Port or reimplement its grid layouts as a v13 "text backend" with its own layout stage over
    the shared **parsed model**. This is the most practical path.
  - (b) Rasterize a shared layout that was computed with monospace measurement, as Ondine's
    `src/cli/Ascii.ts` does from SVG.

## 1. Language, packaging, entry points

| Item | Location |
| --- | --- |
| Entry point | `main.go` calls `cmd.Execute()` |
| CLI | `cmd/root.go`, flags `-f/--file` (or stdin), `--ascii`, `-x/-y` padding, `-p` border padding, `--coords`, `--max-width N\|auto`, `-v` |
| Web UI | `cmd/web.go` (gin), `static/`, `templates/` |
| Library API | `pkg/render/render.go`: `RenderDiagram(input, *diagram.Config) (string, error)` and `RenderDiagramWithStatus` (width-fit status) |
| Dispatch | `pkg/render/diagram.go`: `DiagramFactory` checks sequence, then ER, else **defaults to graph** |
| Interface | `pkg/diagram/interface.go`: `Diagram{ Parse(string) error; Render(*Config) (string, error); Type() string }` |
| Config | `pkg/diagram/config.go`: `UseAscii`, `BoxBorderPadding`, `PaddingBetweenX/Y`, `GraphDirection`, `MaxWidth`, `StyleType` ("cli" or "html" color output), sequence spacing |
| Front matter | `pkg/diagram/frontmatter.go`: front matter is stripped and only `title` is used |

Notable deps (`go.mod`):

- `mattn/go-runewidth`: East-Asian width and emoji cell widths
- `elliotchance/orderedmap`: authored-order node maps
- `gookit/color`: ANSI colors for `classDef color:`
- `gin`: web
- `logrus`
- `cobra`

## 2. Diagram coverage (README § Supported Diagram Types)

**Graph / flowchart** (`pkg/graph/`)

| Status | Feature |
| --- | --- |
| Supported | `graph`/`flowchart` with LR/TD/TB |
| Partial | RL and BT are **accepted but not reversed** (`parse.go:611`) |
| Supported | Labelled edges, chains `A-->B-->C`, the `&` fan-out |
| Supported | Edge kinds `-->`, `-.->`, `==>`, `---`, `--o`, `--x` (different line glyphs: `┆`, `━`) |
| Supported | `classDef`/`class`, used for ANSI or HTML color only |
| Supported | Nested `subgraph` |
| Missing | **Node shapes other than rectangles** |
| Missing | Diagonal edges |
| Missing | Compact placement |
| Missing | Comments and whitespace robustness |

**Sequence** (`pkg/sequence/`) is the most complete of the three.

- Supported:
  - participants and aliases
  - all arrow types, including `-x`, `-)`, `<<->>`, and central `()`
  - self-messages
  - notes
  - `loop`/`opt`/`alt`/`else`/`par`/`and`/`critical`/`option`/`break`/`rect`
  - `autonumber`
  - `create`, `box`
  - Unicode/CJK
- Missing: activation boxes (README says not supported, although activation tests exist).

**ER** (`pkg/er/`)

- Supported:
  - all crow's-foot cardinalities, plus numeric and word forms
  - identifying (solid) vs non-identifying (dashed) relationships
  - attribute tables with PK/FK/UK and comments
  - aliases
  - self-relationships
- Missing: `u--` (MD_PARENT). `style`/`classDef` are parsed and ignored.

Not supported at all: class, state, gantt, pie, mindmap, git, C4, timeline, and every other Mermaid
type. Unknown input falls through to the graph parser.

## 3. Parsing

- Every parser is hand-written and **line-by-line with regexes**:
  - `pkg/graph/parse.go` (733 lines)
  - `pkg/sequence/parser.go` (961 lines)
  - `pkg/er/parser.go` (462 lines)
- The graph parser works like this:
  - It reads the header line to get the direction.
  - It iterates the remaining lines, using a regex to detect `subgraph ...` and `end` (tracked on a
    stack).
  - Each other line goes to `parseString`, a recursive pattern match over edges, `&`, and labels.
  - **If parsing fails, the whole line becomes a node label** (`parse.go` ~line 680). This is
    lenient and does not report Mermaid-compatible errors.
- Models are internal and unexported:
  - graph: `Properties` with an ordered map of `node -> []textEdge`, plus `nodeSpecs`, `subgraphs`,
    and `styleClasses`
  - sequence: `sequence.SequenceDiagram`
  - ER: `er.ErDiagram` with `Entities` and `Relationships`
- There is no grammar reuse from Mermaid (jison or Langium), no shared AST, and no compatibility
  oracle. Accepted syntax is "what the regexes match". Directives and `%%{init}%%` are ignored, and
  front matter yields only the title.

## 4. Layout approach (grid-based, per type)

### Graph (`pkg/graph/graph.go`, `mapping_node.go`, `mapping_edge.go`, `arrow.go`, `fanout.go`, `draw.go`)

Two coordinate systems are used:

- **`gridCoord`**: a logical grid. Each node occupies a 3x3 block of grid points (border, content,
  border), with one gap point between nodes, so the next level is `+4`.
- **`drawingCoord`**: character cells. Column widths and row heights are computed per grid column
  or row from label widths and padding (`setColumnWidth`, `mapping_node.go`). The grid therefore
  stretches non-uniformly into cells.

Placement (`createMapping`, `graph.go:185`):

1. Root nodes (those with no incoming edges seen so far, in authored order) go to level 0. They are
   stacked perpendicular to the flow at `highestPositionPerLevel[0] += 4`.
2. A special case for LR with both external roots and subgraph roots: subgraph roots go to level 4.
3. For each node in authored order, its unplaced children go to `level+4` at the next free
   perpendicular slot (`reserveSpotInGrid` resolves collisions). There is a subgraph-sibling
   anchoring heuristic.
4. This is a **greedy BFS-ish tree placement**. There is no rank assignment by longest path, no
   crossing minimization, and no cycle handling beyond "already placed, skip".

Edge routing:

- `determinePath` picks start and end sides (`direction.go`, `determineStartAndEndDir`). It then
  runs **A\* on the grid** (`arrow.go:getPath`) with 4-neighborhood moves, a Manhattan heuristic,
  and +1 for corners to prefer straight lines. Occupied node cells are blocked.
- Paths are merged into segments (`mergePath`). The grid grows for paths (`increaseGridSizeForPath`).
- Labels are placed on the longest segment (`determineLabelLine`), and fan-outs from `&` get shared
  trunks (`fanout.go`).

Drawing (`draw.go`):

- The drawing is a 2D `[][]string` canvas. Boxes, lines, and corners are drawn into it, and junction
  characters merge (`mergeJunctions`: `┬ ┴ ├ ┤ ┼`).
- Glyph sets are Unicode box drawing or `--ascii` (`+ - | > v`).
- Colors come from `classDef color:` (ANSI or HTML).
- Width fitting: if output exceeds `MaxWidth`, it retries once with padding 1/1 and never wraps or
  crops (`pkg/render/diagram.go`).

### Sequence (`pkg/sequence/renderer.go`, 1.2k lines)

- Participants become columns spaced by label width plus `SequenceParticipantSpacing`.
- Messages become rows. Blocks (loop/alt/par, ...) are labelled frames with nesting depth. Notes
  are boxes.
- It is a direct cell-space layout, essentially the same algorithm as Mermaid's sequence renderer in
  integer cells.

### ER (`pkg/er/layout.go`, 750 lines)

- Entities render as tables and are placed in a **near-square grid**
  (`cols = ceil(sqrt(n))`, `placeEntities`) in authored order.
- Gutters between cells are `lanes + maxLabel + 5` wide, with **one routing lane per relationship**,
  so connectors never overlap.
- Connectors are orthogonal polylines through gutters. Crow's-foot tokens sit at attach points.
- An overlay of solid and dashed bits is composited into box-drawing glyphs (`composite`,
  `glyphFor`).
- Correct and collision-free, but space-hungry: wide diagrams for even a handful of relationships.

## 5. Quality and limitations

Strengths:

- It produces good terminal output for small and medium diagrams.
- Unicode width is handled with `go-runewidth`, including a recent fix for Unicode labels overrunning
  cells (`3ffc19f`).
- An `--ascii` fallback is available.
- Testing is solid: about 330 golden files (`pkg/graph/testdata/{ascii,extended-chars,multibyte}`,
  `cmd/testdata/{er,er-ascii,sequence,sequence-ascii}`). Each file has the input, a `---` line, and
  the exact expected output (for example `pkg/graph/testdata/ascii/ampersand_lhs_and_rhs.txt`).
  There are also smoke, regression, and coverage tests for ER.

Weaknesses:

- **Graph layout is naive.**
  - It is greedy placement in authored order with no crossing reduction, so larger or cyclic
    flowcharts get long detours and very tall or wide output.
  - RL and BT are not reversed.
  - Every node is a rectangle.
  - The README TODO list itself names "place nodes in a more compact way" and "diagonal arrows".
- **Parser fidelity is low.**
  - It is regex and line based, falls back to "the line is a node", and has no error positions.
  - It ignores directives and config.
  - Edge cases such as quoted labels, `&` inside quotes, and comments have needed point fixes (see
    recent commits).
  - It would diverge from any v13 grammar.
- **Coverage is 3 of about 25 types.**
- It is Go, so embedding in a JS library needs a rewrite or a TinyGo/WASM build. No such build
  exists, and gin, logrus, and reflection would bloat it.
- There is no shared model or API boundary. Models are unexported package internals, and the only
  public API is `string -> string`.

## 6. Plugging in as a v13 output backend

The v13 question is whether text output can be one more backend over a shared layout model
(`LayoutData` → SVG | ASCII), or whether it needs its own layout.

**Its own layouts are cell-native and not reusable as a renderer over pixel layouts.**

- Graph layout decides node positions *in grid units* and sizes rows and columns from label
  character widths. Routing is A\* over that grid.
- Sequence and ER compute directly in cells.
- None of these consumes coordinates. Each one *is* a layout algorithm.

Options for v13:

1. **Shared parse model, own text layout.**
   - Each v13 diagram exposes a stable, serializable *semantic model* (nodes, edges, subgraphs,
     messages, entities). A text backend implements per-type cell layouts in the same spirit as
     mermaid-ascii, ported to TS.
   - The algorithms are small: graph placement + A\* is about 2k lines, sequence about 1.2k, ER about
     750.
   - Pros: the best-looking terminal output, independent of pixel layout quality, and
     mermaid-ascii's ~330 golden fixtures become a ready-made test corpus. The parser is replaced by
     v13's real one, which fixes the fidelity problem.
   - Cons: a separate layout to maintain per type, and output that will not visually match the SVG
     arrangement.
2. **Shared layout plus rasterizer.**
   - Run the normal v13 layout with a **monospace cell measurer** (width = chars × cell width,
     height = lines × cell height), snap to the cell grid, then rasterize boxes and orthogonal edge
     polylines into characters.
   - Ondine already ships this (`/Users/knsv/repos/mermaid-v13/.tmp/ondine/src/cli/Ascii.ts`,
     about 820 lines). It parses its own SVG, treats one cell as 0.6 em by 1 em, maps strokes to
     `- | + / \`, maps small filled shapes to arrowheads, and respects paint order.
   - Pros: one layout and consistent arrangement, so any diagram type gets ASCII nearly for free.
   - Cons: it needs orthogonal or snappable edge routing and enough spacing that edges land on
     distinct cells. Curves and diagonals degrade to `/ \`. Pixel padding is wasteful in cells.
   - This works much better if the layout model carries **abstract geometry** (polylines, box
     rects) rather than only SVG strings, so the rasterizer does not need to re-parse SVG.
3. **Hybrid (recommended to evaluate).**
   - Use option 2 as the generic fallback for all types, driven by the shared `LayoutData` with a
     monospace measurer and orthogonal routing.
   - Use option 1 for the handful of types where text output matters most and cell-native layout is
     clearly better: sequence (trivially columnar), ER tables, and perhaps flowchart.
   - mermaid-ascii's algorithms and goldens serve as the reference for option 1.

Requirements this puts on the v13 core, whichever option is chosen:

- Measurement must be injectable and deterministic (a monospace or cell measurer). This is the same
  requirement as a WASM port, see `ondine.md` §13.
- The layout output should be geometry data (node rects, edge polylines with bend points, label
  anchors, cluster rects) produced before SVG emission.
- Edge routing should be able to produce orthogonal polylines.
- Integer snapping should be possible, for example with a layout option for a grid quantum.

## 7. License and reuse

- MIT (`LICENSE`, © 2023 Alexander Grooff). Porting the algorithms or golden fixtures into Mermaid
  (also MIT) is permitted with attribution.
- Golden fixtures (`pkg/graph/testdata/**`, `cmd/testdata/**`) are plain text in the form "input,
  `---`, expected output". They can be adopted directly as acceptance tests for a TS text backend.

## 8. Deep read for M2 (graph backend)

Scope: `pkg/graph`, `pkg/render`, `pkg/diagram`, `cmd` at HEAD `5a9df15`. All paths are relative
to the mermaid-ascii repo. Where a code comment and the code disagree, the code is reported.
For example, `mapping_edge.go:9-30` says only ASCII distinguishes strokes and heads, but
`draw.go:127-143` and `arrow.go:272-283` distinguish them in Unicode too.

### 8.1 Cell geometry (the "cell unit profile")

There are two coordinate spaces.

- **Grid points.** Each node reserves a 3×3 block of grid points: border, content, border
  (`mapping_node.go:100-107`). The next slot is always `+4` (`graph.go:249,274-276`,
  `mapping_node.go:94-98`), so between two node blocks there is exactly **one** grid line. That
  line is the only routing channel.
- **Cells.** Every grid column and row gets a width or height in cells
  (`columnWidth`/`rowHeight` maps). A grid point maps to the **centre** of its column and row
  (`graph.go:727-745`: `x + columnWidth[x]/2`).

Sizing rules (`mapping_node.go:33-77`):

| Grid line | Cells |
| --- | --- |
| Node border column or row | 1 |
| Node content column | `2*BoxBorderPadding + labelWidth` |
| Node content row | `contentHeight + 2*BoxBorderPadding`, where `contentHeight = lines + (lines-1)*1` (`label.go:12,43-48`) |
| Gap column before a node (x>0) | `paddingX`, assigned, not maxed (`:59`) |
| Gap row before a node (y>0) | `max(existing, paddingY)`, plus **4** if the node is the topmost node of its subgraph with an incoming edge from outside (`:62-75`, `graph.go:395-442`) |
| Grid line touched only by a path | `paddingX/2` or `paddingY/2`, which is 2 at the defaults (`mapping_node.go:79-88`) |
| Fan-out trunk row | `max(existing, 6)` (`fanout.go:18-19`) |

Widths are maxima per grid column. **All nodes that share a grid column get the same box width**,
and all nodes that share a row get the same height. The box is drawn across
`columnWidth[x]+columnWidth[x+1]` (`draw.go:270-279`). In
`ascii/two_layer_single_graph_longer_names.txt`, for example, "BCDEFG" is drawn as wide as
"CDEFGHI". The label is centred in the box (`draw.go:331-344`).

Defaults: `BoxBorderPadding=1`, `PaddingBetweenX=5`, `PaddingBetweenY=5` (`diagram/config.go:58-60`,
`graph/parse.go:16-20`, `cmd/root.go:20-22`). Compact mode uses padding 1/1 and leaves
`BoxBorderPadding` unchanged (`render/diagram.go:94-97`).

Concrete numbers at the defaults:

| Profile item | Cells |
| --- | --- |
| Node box (one-line label of width w) | `(w+4) × 5`: border, 1 pad, text, 1 pad, border on both axes. An empty label gives 4×5 |
| Multi-line label | n lines take `2n-1` rows, with one blank row between lines. The box is `(w+4) × (2n+3)` |
| Gap between ranks, and between nodes in a rank | 5 cells on each axis (`paddingX` is the column gap, `paddingY` the row gap). In LR the rank gap is `paddingX`; in TD it is `paddingY` |
| Edge endpoint | The midpoint of a box side (`direction.go:5-15`, grid offsets `Up={1,0}` and so on). The line starts in the cell next to the source border, and the arrowhead sits in the cell next to the target border (`arrow.go:192`, `drawLine(..., 1, -1)`, `draw.go:146-163`) |
| Edge label | The label's column is widened to `len(label)+3`, or `+4` when bidirectional (`mapping_edge.go:200-234`). The placement inset is 1 cell at the start and 2 at the end (dash plus head) (`arrow.go:425-463`). Collision avoidance grows the row or column by 2, up to 8 times (`mapping_edge.go:325-341`). Fan-out labels are kept at least 3 cells apart (`fanout.go:33-42`) |
| Group frame | Padding 2 on the left, right and bottom: the border plus 1 blank cell. Top: `2 + (titleContentHeight + 1)`. A one-line title gives a border row, the title row, 2 blank rows, then content (`graph.go:546-552`) |
| Group title width | The frame widens symmetrically until the title fits exactly between the borders, with 0 margin (`graph.go:537-544`, e.g. `\|Frontend Services\|`) |
| Gap between root groups | At least 1 line (`graph.go:444-495`) |
| Outside margin | 0. The output is the tight canvas, offset only so that negative group coordinates become 0 (`graph.go:557-599`) |

The grid does **not** reserve space for group frames. A frame is computed afterwards from the cell
boxes of its nodes (`graph.go:497-555`), so it sits inside the 5-cell gaps. The only reservation is
the "+4 rows" hack. With small padding, frames touch or overlap neighbours
(`ascii/subgraph_three_separate.txt`, `subgraph_complex_mixed.txt`).

### 8.2 Text width

- **Node and group labels.** `newGraphLabel` (`label.go:19-37`) first normalises `<br>` (in any case,
  with or without `/`) and the literal two-character `\n` to newlines. It then splits the lines and
  sets `width = max(runewidth.StringWidth(line))`. go-runewidth applies East-Asian Wide (CJK = 2)
  and emoji widths, and `EastAsianWidth` (ambiguous width) is left at its default, narrow.
- **No wrapping anywhere.** Long labels widen their column.
- **Drawing graphemes (commit `3ffc19f`).** `textCells` (`draw.go:55-89`) groups runes into
  clusters. A zero-width rune (combining mark, VS16, ZWJ) joins the previous cluster, and the rune
  after a ZWJ also joins it. Each cluster is written into one cell, with `""` in the continuation
  cells of a wide cluster. Zero-width leading clusters are appended to the previous cell
  (`draw.go:91-111`). Before this fix the code drew rune by rune with `max(width,1)`, which made
  `👩‍💻` and `á́́́́` overrun the box. The commit added `ascii/zwj_label.txt`, `zwj_label_compact.txt`
  and `combining_mark_label.txt`, plus a uniform-display-width assertion
  (`render_graph_test.go:41-55,266-280`).
- **This is a heuristic, not UAX #29.** No grapheme library is used. Regional-indicator flags, for
  example, would split.
- **Edge labels are not width-aware (bug).** `determineLabelLine`, `labelBounds` and
  `drawTextOnLine` use `len(e.text)`, the UTF-8 **byte** length (`mapping_edge.go:138,361-366`,
  `arrow.go:413,488`). Non-ASCII edge labels therefore over-widen their column and sit off-centre:
  `multibyte/cyrillic_node_and_edge_labels.txt` renders `-метка------>`. Only the TD fan-out path
  uses `runewidth` (`fanout.go:88`).
- **Edge labels are single-line.** `<br>` in an edge label stays literal. Only node and subgraph
  labels go through `newGraphLabel`.
- **Line-splitting quirk.** `splitGraphLines` (`parse.go:130-169`) treats a literal `\n` *outside*
  brackets as a statement separator. Inside `[...]`, a raw newline or `\n` stays in the label.

### 8.3 Edge routing

Pipeline per edge, in authored order (`graph.go:309-321`):

1. `setColumnWidth` for all nodes.
2. `layoutFanouts`.
3. For each non-fan-out edge: `determinePath`, then `increaseGridSizeForPath`, then
   `determineLabelLine`.

Sizes are therefore mutated *while* edges are routed: later labels widen columns that earlier
edges already use. This works only because routing happens in grid space.

**Side selection** (`direction.go:55-158`) is based on the relative grid direction of the source
and target blocks.

| Case | LR (preferred, then alternative) | TD (preferred, then alternative) |
| --- | --- | --- |
| Same axis, forward | Right→Left (no alternative) | Down→Up (no alternative) |
| Diagonal forward | Down→Left, then Right→Up | Right→Up, then Down→Left |
| Back edge | Down→Down (source bottom to target bottom), then Left→Right | Right→Right, then Up→Down |
| Self loop | Right→Down | Down→Right |

Both candidates are routed. The one with fewer **merged segments** wins, ties going to the
preferred one (`mapping_edge.go:62-111`); fewer segments means fewer bends.

**Parallel and duplicate edges** are keyed by the unordered node pair (`graph.go:52-62`). The second
and third edge between the same pair take forced sides (`mapping_edge.go:114-134`): in LR
Down/Down, then Up/Up; in TD Right/Right, then Left/Left. This applies only when the pair lies
along the flow axis. A fourth edge falls back to normal routing and overlaps.

**A\*** (`arrow.go:48-106`):

- 4-neighbourhood, step cost 1, **no turn cost** in g.
- The heuristic is Manhattan distance, plus 1 when the points are not aligned. That overestimates,
  so the heuristic is not admissible, but it nudges the search towards straight runs.
- Ties go to heap order.
- `mergePath` (`arrow.go:150-175`) removes collinear interior points, leaving a corner list.
- **The only obstacles are node blocks** (`isFreeInGrid`: `g.grid[c] == nil`; the target cell is
  always allowed). Negative coordinates are blocked, and the grid is unbounded towards +x/+y.
  `increaseGridSizeForPath` just gives new lines a default size.

Consequences:

- **Edges never block each other.** They may share cells, run on top of each other, and cross.
  Every channel is one grid line wide, so two edges through the same gap use the same cells.
  Shared runs become visual trunks through junction merging.
- **One port per side.** Every edge into a given side uses the same midpoint cell, so arrowheads
  coincide.
- **Frames are invisible to the router.** Edges cut straight through group borders.

Error path (`mapping_edge.go:73-96`):

- If the preferred route fails, the edge is assigned the *not-yet-computed* `alternativePath`
  (nil).
- If the alternative fails, the code does not return; it goes on to pick the empty alternative.
- Both errors are printed to **stdout** with `fmt.Printf`.
- It is effectively unreachable, because the grid is open, but it is a latent panic.

**Fan-out trunks** (`fanout.go:9-75`) are hand-built paths, not A\*. They apply only when all of
these hold:

- the direction is TD and there are **no subgraphs**
- the node has 2 or more out-edges, all `-->` solid, with an arrowhead, not bidirectional, to
  distinct targets exactly one level down
- at least one of the edges is labelled
- no other edge spans the trunk row

The trunk is the gap row (`y+3`), drawn 2 cells below the source. Each branch is
`[from, (from.x,row), (to.x,row), to]`. All labels sit on one row, centred on their branch, and
columns are widened so labels stay at least 3 cells apart. See `ascii/fanout_labels_tb*.txt`.

**Bidirectional.** Only the `<-->` operator, optionally with `|label|`, is bidirectional
(`parse.go:432-454`). It draws heads at both ends (`arrow.go:131-134`) and reserves label padding
of 4. `A-->B` together with `B-->A` is two edges: the second takes the duplicate-pair sides
(`ascii/bidirectional_edge_labels_*.txt`).

**Self loops** go out of the right side and into the bottom in LR, and down then right in TD
(`ascii/self_reference.txt`). The loop shares the exit cell with any other edge leaving that side
(`self_reference_with_edge.txt` shows `--+->`).

**Label placement** (`mapping_edge.go:136-207`):

1. Walk the merged segments and take the first one whose label line is free and whose bounds do not
   touch an arrowhead or node border, and whose summed column width is at least the label length.
   Failing that, take the widest such segment. Segments whose midpoint column is a **node column**
   are only a fallback (`:156-161`), because widening one distorts that box.
2. Then try unused 3-point sub-segments of horizontal runs (`:380-402`).
3. Then the node-column fallback, then the first segment.
4. The midpoint column is widened to the label length plus 3 or 4.

The label is written horizontally, centred on the segment midpoint, *over* the line glyphs
(`arrow.go:411-433,465-490`). On vertical segments in TD it replaces the `│` on that row. Labels
are **never truncated**; space is always made by widening.

Failure modes visible in the goldens:

- **Overlapping back edges, ambiguous labels.** In `ascii/back_edges_two_labels_td.txt`, C→A and
  C→B share the right-hand column. The `back1` label lands beside B's arrowhead (`<-back1`) and
  `back2` sits on the shared trunk.
- **Node widened by a label.** In `ascii/bidirectional_edge_labels_td.txt` the label fell back to a
  node column, so boxes A and B are 12 cells wide for one-letter labels. Fallback labels widen node
  columns in this way.
- **Merged arrivals.** In `ascii/preserve_order_of_definition.txt`, B→A, the self loop A→A and C→A
  merge into one tangle (`<-+--`, a shared `+----+` trunk).
- **Edges through frames.** `ascii/subgraph_edge_less_member.txt`, `subgraph_td_multiple*.txt` and
  `cjk_td.txt` show edges crossing group borders, drawn as `-------|------` or a `|` through `+`.
  An edge exits Frontend through its right border and enters Backend through its top. In `cjk_td`
  the edge label `配送` sits outside the frame, misaligned.
- **Detours from greedy placement.** In `ascii/backlink_from_*.txt` and
  `open_link_junction_chain_skip_td.txt`, D is placed at level 1 although its longest path is 3.
- **Compact mode leaves no shaft.** With padding 1, unlabelled edges degrade to a bare head:
  `| A |>| B |` (`compact_fit.txt`).

### 8.4 Glyphs

Drawing layers are merged in this order: group frames, nodes, edge lines, corners, arrowheads,
box-start tees, edge labels, and finally group titles (`graph.go:601-636`).

| Element | Unicode | `--ascii` |
| --- | --- | --- |
| Node box and group frame | `┌ ┐ └ ┘ ─ │` (`draw.go:285-306,364-385`) | `+ - \|` |
| Solid line (h / v) | `─` / `│` | `-` / `\|` |
| Dotted `-.->` | `┄` / `┆` | `-` on every other cell, giving `- - >`; vertical `:` (`draw.go:187-226`) |
| Thick `==>` | `━` / `┃` | `=` / `I` |
| Corners: solid and dotted | `┌ ┐ └ ┘` (`arrow.go:359-409`) | `+` |
| Corners: thick | `┏ ┓ ┗ ┛` | `+` |
| Arrowhead ↑ ↓ ← → | `▲ ▼ ◄ ►` (`arrow.go:288-328`) | `^ v < >` |
| Diagonal heads and lines (defined but unreachable, because routes are orthogonal) | `◥ ◤ ◢ ◣`, `╱ ╲` | `/ \` |
| Arrowhead fallback | `●` | `*` |
| `--o` end | `●` | `o` |
| `--x` end | `✕` | `x` |
| `---` (no head) | A tee on **both** boxes (`arrow.go:116-124,235-258`) | Nothing |
| Edge leaving a box | Tee on the border: `┬ ┴ ├ ┤` (`arrow.go:205-233`). Skipped for thick edges | The border is left as is |

**Junction merging** (`draw.go:491-564`) happens only in Unicode mode, and only when both the
existing glyph and the new glyph are light box-drawing characters.

- `mergeJunctions` is a 10×10 table over `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴`. For example `─`+`│`→`┼`,
  `│`+`┌`→`├`, `─`+`┐`→`┬`, and a tee plus a perpendicular line gives `┼`.
- A pair with no entry keeps the existing glyph (`c1`), so `┼` stays `┼`.
- `╴ ╵ ╶ ╷` are listed as junction characters but have no table rows.
- Heavy (`━ ┃ ┏…`) and dashed (`┄ ┆`) glyphs are **not** junction characters: they overwrite, or are
  overwritten, with no merge.
- In ASCII mode the last writer always wins, and corners are `+`.

A **crossing** is drawn as `┼` in Unicode, which looks the same as a 4-way junction. In ASCII the
later line overwrites the earlier one. There is no hop or gap glyph.

`drawingToString` (`draw.go:566-578`) prints the full rectangular canvas, so every row is padded
with spaces to the canvas width.

### 8.5 Shapes

Confirmed: everything is drawn as a rectangle.

- `parseNode` (`parse.go:202-236`) recognises `[( )]`, `{{ }}`, `{ }`, `[ ]`, `( )` and `> ]` only
  to cut out the label. `textNode` and `graphNodeSpec` have **no shape field**.
- `drawBox` always draws a rectangle (`ascii/shaped_nodes_reconnect.txt`).
- Delimiters not in that list leak into the label, because matching is by the first opener plus the
  closing suffix:

| Source | Label shown |
| --- | --- |
| `A((x))` | `(x)` |
| `A([x])` | `[x]` |
| `A[[x]]` | `[x]` |
| `A[/x/]` | `/x/` |

- `@{ shape: … }` is not supported.

### 8.6 Subgraphs

**Parsing** (`parse.go:626-715`):

- `subgraph X`, `subgraph id [Title]` (`[` with a space before it) and `subgraph id["Title"]` are
  accepted (`parse.go:73-90`). The `id` is discarded afterwards.
- A node belongs to every open subgraph on the stack, but only if the line that first mentions it
  is inside that subgraph (`existingNodes` check, `:670-714`). The **first mention wins**: `API`
  in `subgraph_td_multiple.txt` belongs to Frontend only.
- `direction` inside a subgraph is not supported; the line becomes a node.

**Placement** has no group awareness except for three heuristics:

1. In LR, if there are both external roots and subgraph roots that have edges, the subgraph roots
   go to level 4 (`graph.go:205-267`).
2. A child is anchored to the perpendicular coordinate of an already placed sibling in the same
   (innermost-last) subgraph (`graph.go:286-291,362-382`).
3. 4 extra rows are added above the topmost node with an external in-edge (§8.1).

**Frames** (`graph.go:497-555`):

- The frame is the bounding box of member nodes' cell boxes plus the child frames, recursively,
  with the padding from §8.1.
- Frames are drawn outermost first (`graph.go:638-691`).
- `ensureSubgraphSpacing` (`graph.go:444-495`) only adjusts root frames. It "fixes" closeness by
  moving one frame's min edge to the other's max plus 2, which can **shrink** a frame onto its
  content.
- Negative minima shift the whole drawing (`graph.go:557-599`).
- Nesting works (`ascii/subgraph_nested*.txt`, `subgraph_three_levels_nested.txt`). Sibling frames
  may abut with 1 cell between them (`| |`).

**Title** (`draw.go:415-446`):

- One-line title row at `minY+1`, centred with `width/2 - textWidth/2`. Because the frame span is
  inclusive, the title is biased one cell left (`|  Frontend    |`).
- It is clamped to `minX+1` and drawn after all edges, so it overwrites edges crossing the title
  row.

**Edges in and out** are routed as if frames did not exist (§8.3), and `subgraph A --> B` edges to a
subgraph id are not supported.

**Empty subgraphs** are dropped entirely: no frame and no title (`graph.go:498,655`,
`ascii/subgraph_empty.txt`). The fan-out trunk mode is disabled whenever any subgraph exists
(`fanout.go:10`).

### 8.7 Directions

`parse.go:609-623`: `LR` and `RL` become `"LR"`; `TD`, `TB` and `BT` become `"TD"`; a missing
direction gives `"TD"`. **RL and BT are not reversed.** No fixture covers them.

TD differs from LR in code only through the axis swaps listed below. There is no transposition
step: each branch is written out by hand.

- `reserveSpotInGrid` collision step: `y+4` in LR, `x+4` in TD (`mapping_node.go:94-98`)
- the level axis (`graph.go:242-305`)
- side preferences, back-edge sides and self-loop sides (§8.3)
- duplicate-pair sides (`mapping_edge.go:121-130`)
- fan-outs (TD only)
- LR-only subgraph root separation

`Config.GraphDirection` (validated as LR or TD, `config.go:163`) is never applied to the parsed
graph. `Apply` ignores it (`parse.go:721-733`), and the CLI has no flag for it.

### 8.8 Width fitting (`6365a03`)

`GraphDiagram.Render` (`render/diagram.go:79-105`) works like this:

1. Render with the configured padding.
2. If `MaxWidth > 0` and the widest output line (by `runewidth`) is wider than it, re-render
   **once** with `PaddingBetweenX = PaddingBetweenY = 1`.
3. Record a `WidthStatus{Requested, Limit, Width, Compacted, Met}`.

There is no wrapping, cropping, rank re-orientation, or label shortening.

`RenderDiagramWithStatus` (`render/render.go:26-61`) prepends the front-matter title
(`title + "\n\n"`) and then recomputes `Width` and `Met`. Its `Met` requires `Requested`
(`:58`), unlike the inner `Met`, which is true when width fitting was not requested.

`cmd/root.go:82-86` prints a stderr note when compacting was needed and worked, and a warning when
it was not enough. `--max-width auto` needs a TTY (`:99-120`). Width fitting applies to graphs
only, not to sequence or ER.

| Golden | `maxWidth` | Result |
| --- | --- | --- |
| `ascii/normal_fit.txt` | 100 | 25 columns, not compacted |
| `ascii/compact_fit.txt` | 20 | Compacted to 17 columns (`\|>\|`) |
| `ascii/cannot_fit.txt` | 5 | Compacted to 19 columns, not met |
| `ascii/zwj_label_compact.txt` | 12 | Compacted |

`TestGraphMaxWidthGolden` (`render/max_width_test.go:13-49`) asserts the status flags.
`verifyMap` mirrors the same retry rule (`graph/graph_test.go:29-33`).

v13's `availableWidth` (tighten, then turn LR into TB) is strictly richer.

### 8.9 Colour

- **Supported:** `classDef name k:v,k:v` (`parse.go:238-259,482-491`). An invalid `classDef` is a
  hard parse error (`parse.go:679-681`).
- **Supported:** `:::name` on a node (`parse.go:206-209`).
- **Not supported:** the `class A,B name` statement. Despite the README tick, it is unparsed and
  falls through to "the line is a node". `style` and `linkStyle` are unsupported in the same way.
- Only the `color` key is used. It colours node label text only, not borders, edges or frames
  (`draw.go:341-343`).
- `fill` and `stroke` are ignored.

The colour is applied through `wrapTextInColor` (`draw.go:448-461`) **per text cell**, one grapheme
at a time:

- `cli` uses `gookit/color` `HEX(c).Sprint`, which gives 24-bit ANSI SGR codes around each cell.
- `html` gives `<span style='color: X'>…</span>` around each cell.

The web UI uses `html` (`config.go:118-139`). The goldens never exercise colour, because the runner
uses `cli` and none of the fixtures sets `color`.

### 8.10 Golden harness

**File format** (`diagram/testutil/testutil.go:28-91`):

```
[paddingX = N]   optional, case-insensitive; must come before any Mermaid line
[paddingY = N]
[maxWidth = N]
<mermaid source>
---              the first line that is exactly "---"
<expected output>
```

- Header regex: `^(?i)(padding[xy]|maxwidth)\s*=\s*(\d+)\s*$` (`:52`). Both `paddingX=2` and
  `maxWidth = 20` forms occur.
- Defaults are 5/5. `BoxBorderPadding` cannot be set per file and is always 1.
- `␠` (U+2420) in the expected output decodes to a space (`:12-16`). It is used in 3 files
  (`ascii/quoted_label_markers.txt`, `ascii/cjk_td.txt`, `extended-chars/cjk_td.txt`) to make
  trailing spaces explicit.
- Only one final `\n` is trimmed (`:89`).

The graph parser *also* strips `paddingx=N` lines and stops at a `---` line (`parse.go:533-590`), but
the runner overwrites padding afterwards.

**Comparison** is an **exact** string equality (`graph/graph_test.go:15-39`):

- `NormalizeWhitespace` exists (`testutil.go:120-136`) but the graph runner does not use it.
- **Trailing spaces are significant.** The output is a padded rectangle (§8.4), and fixtures carry
  those spaces: 82 of the 142 graph fixtures have lines ending in a space.

Which mode runs which directory:

| Directory | Mode |
| --- | --- |
| `ascii/` | `useAscii=true` |
| `multibyte/` | `useAscii=true` |
| `extended-chars/` | Unicode |

Style is `cli` with no colour. Directories are listed in `graph_test.go:49-98`.

Sequence fixtures use `ReadSequenceTestCase`: split on `\n---\n`, both sides `TrimSpace`d
(`testutil.go:100-118`).

**Fixture counts:**

| Directory | Files |
| --- | --- |
| `pkg/graph/testdata/ascii` | 92 |
| `pkg/graph/testdata/extended-chars` | 47 (Unicode twins of a subset of `ascii/`) |
| `pkg/graph/testdata/multibyte` | 3 |
| `cmd/testdata/er` | 70 |
| `cmd/testdata/er-ascii` | 13 |
| `cmd/testdata/sequence` | 57 |
| `cmd/testdata/sequence-ascii` | 39 |

That is **142 flowchart** fixtures and 179 sequence and ER fixtures, 321 in all. `cmd/testdata`
has no graph fixtures.

The sequence and ER goldens use the same "input `---` expected" shape. They are reusable later as
oracles for sequence and ER text backends, with the same lenient-parser caveats.

**Flowchart fixtures that real Mermaid would reject or read differently:**

| Fixture | Issue |
| --- | --- |
| `ascii/shaped_node_boundary_labels.txt` (`A{literal"}`, `C{bad}}`) | Rejected by the v12 lexer (stray `"`, unbalanced `}}`). mermaid-ascii renders the raw text as labels |
| `ascii/shaped_node_unmatched_quote.txt` (`A{bad\"}}`, …) | Same |
| `ascii/multiline_single_node.txt` (`A["line1\nline2"]`) | mermaid-ascii breaks the line at `\n`. v12 does not treat `\n` as a line break (use `<br>`); verify against v12 |
| `ascii/subgraph_td_multiple*.txt` (`API` named in Frontend, then used in Backend) | Membership is first mention. v12 assigns contested nodes differently; verify. Output also differs because of frame overlap |
| `ascii/subgraph_empty.txt` | Valid Mermaid. v12 draws an empty cluster; mermaid-ascii drops it |
| `ascii/shaped_nodes_reconnect.txt` | Valid. The shapes are lost |
| All `paddingX`, `paddingY` and `maxWidth` headers | Not Mermaid. Strip them before parsing |

Fixtures that are valid but whose meaning is lost because of the direction collapse (none exist
yet): any `RL` or `BT` input.

Constructs that would silently become nodes under mermaid-ascii (none are in the fixtures):

- `class A x`, `style …`, `linkStyle …`, `click …`, `direction …`
- `A -- text --> B`
- long links (`--->`, `-.-`, `===`)
- a trailing `;` on statements

### 8.11 Code size and what to port

**Non-test graph code is 3,498 lines.** Lines per file in `pkg/graph`:

| File | Lines |
| --- | --- |
| `parse.go` | 733 |
| `graph.go` | 745 |
| `draw.go` | 670 |
| `arrow.go` | 490 |
| `mapping_edge.go` | 424 |
| `direction.go` | 158 |
| `mapping_node.go` | 110 |
| `fanout.go` | 91 |
| `label.go` | 48 |
| `math.go` | 29 |

Plus `render/{diagram,render}.go` at 207 lines.

| Part | Where (lines) | Verdict for v13 |
| --- | --- | --- |
| Parser | `parse.go` (733) | Drop. v13 has its own |
| Placement | `graph.go:185-307` and subgraph heuristics `:351-442`, `mapping_node.go:90-110` (~350) | Drop. v13's layered layout is far better |
| Cell sizing | `setColumnWidth`, `gridToDrawingCoord` (~70) | Reimplement as "LayoutModel → cell rects". Keep the numbers from §8.1 |
| Router | A\* `getPath`/`heuristic`/`mergePath`, side choice `determineStartAndEndDir`, `determinePath` (~330) | Optional fallback only (see below) |
| Label placement | `mapping_edge.go:136-424` (~290) | Reimplement. It is welded to grid widening, and v13 already gives label centres |
| Fan-out | `fanout.go` (91) | Idea only. v13's stepped routing should produce trunks itself |
| Canvas, glyphs, junctions, text cells | `draw.go` (`drawLine`, `drawBox`, `mergeJunctions`/`mergeDrawings`, `textCells`/`drawTextCells`, `drawingToString`) and `arrow.go:108-490` (heads, corners, tees, label text) (~650) | **Port.** It works on cell coordinates only and is layout-agnostic |
| Width fitting | `render/diagram.go:79-105` | Trivial. v13's `availableWidth` replaces it |

**Is the router separable from placement?** Mechanically, yes. `getPath` and `determinePath` read
only:

- `g.grid`, a `gridCoord → node` occupancy map
- `node.gridCoord`
- `graphDirection`
- `edgeCounts`

Column widths affect drawing only. Placement is just `createMapping:189-307`, so node blocks
supplied from v13 could replace it, for example `rank*4` × `order*4`. The rest of the pipeline from
`graph.go:309` would then run unchanged.

That is the wrong integration for v13, for three reasons:

1. It keeps only rank and order. v13's Brandes-Köpf coordinates, group rects and ports are thrown
   away, and cell positions come from column stretching instead.
2. The coarse grid has a **single lane per channel**. Edges overlap by construction, and there is
   one port per side.
3. The router ignores group frames.

**Recommendation.** Snap v13's `'stepped'` `RoutePoint[]` polylines, which already have distinct
tracks (`spacing.edge`) and ports, to cells. Run the layout with cell-unit spacing and a monospace
measurer, then draw with a port of mermaid-ascii's glyph and junction layer. A cell-space A\*
(obstacles: boxes, frames, title bands) is worth keeping only as a **repair** step, for segments
that collide after quantisation. It would be a fresh, around-150-line implementation with a turn
penalty, not a port of the grid router.

### 8.12 README, TODO and docs

- `docs/` holds only `colored_graph.png`. There are no design notes.
- `.cursor/rules/tests.mdc` asks for a golden in `testdata/ascii` for every change.
  `scripts/fix_test.sh` regenerates a golden's expected half from the binary (a
  re-baseline-by-running workflow).
- README "How it works" (`README.md:578-~640`) describes the 3-points-per-node grid with one point
  in between, matching §8.1.
- README TODOs (`README.md:675-707`):
  - Open: shapes other than rectangles; whitespace and comment robustness; diagonal arrows; more
    compact node placement; activation boxes; more diagram types.
  - Done: "prevent arrows overlapping nodes" (nodes only; edges still overlap each other) and
    `--max-width`.
- The README overclaims `class` statements; see §8.9.
- Nothing in the repo plans crossing reduction, lane separation, frame-aware routing, RL/BT, or
  colour beyond `color`. All of these are what v13's layout already provides or must add for M2.
