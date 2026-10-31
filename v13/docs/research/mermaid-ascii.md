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
