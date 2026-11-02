# Grid-snapping prototype: stepped routes on a character grid

<!-- cspell:ignore testdata multibyte Segs -->

Issue #39 (M2 spec #37, DESIGN §6.3 work item 1). The question: how often do the layered engine's
`stepped` routes collide once they are snapped to cells, and what must the repair router (#45)
handle? The answer decides the scope of #42 (engine `grid` rounding) and #45 (snap + repair).

The prototype was throwaway and is not committed. It lived in `.tmp/snap-proto/`: a copy of
`packages/core` with the px constants scaled to cells, plus the v13 flowchart parser and a
`snap.ts` driver.

## TL;DR

- **Snapping after layout is not enough. #42 is needed.** The engine places boxes, ports and
  tracks in continuous space. Rounding each of these on its own after layout breaks what the engine
  aligned:
  - 48 % of inputs have boxes whose edges fall on half cells;
  - 16–31 % of inputs end up with an edge end on a box corner or off the side;
  - straight edges get a one-cell jog;
  - float noise at `.5` ties splits one vertical run across two columns.

  A smarter post-layout snap only trades these defects for others (see "careful snap" below).
- **The biggest problem is port capacity, not routing.** A one-line LR node is 3 rows high, so
  each side has **one** usable cell. The engine spreads ports over a continuous span (`PORT_PITCH`)
  and has no idea of that limit. Per edge end, LR inputs show about 10× the end defects of TB. Both
  fixes belong upstream of the router: either the engine allots ports in whole cells and bundles
  any ends that do not fit, or the builder grows the box. See open question 1.
- **What the stepped routes already get right.** Across 49,642 segments the stepped routes have
  no diagonal segments before rounding. Segments through boxes or edge labels are almost nil: one
  input outside self-loops, and none through labels with naive rounding. The router does not need
  to fix general routing.
- **#45's repair scope is small, but it is real.** It must handle:
  - edge-on-edge sharing, mostly fan-in/fan-out siblings;
  - runs along group frames, because padding 1 leaves no lane;
  - corner touches;
  - edges to a group from inside it.

  Self-loops need a text-form drawing of their own, not repair. Large graphs need a bounded
  search.

## Method

**Inputs.** 694 distinct inputs: 6,835 edges and 49,642 route segments. Duplicates were removed
by content hash, which dropped 55. Two inputs failed to parse.

- **88 mermaid-ascii fixtures** (`pkg/graph/testdata/{ascii,extended-chars,multibyte}`). The input
  is the text before the first `---`, with `paddingX/paddingY/maxWidth` header lines stripped. Most
  of `extended-chars/` duplicates `ascii/`.
- **606 e2e flowchart `.mmd` files**: every e2e `.mmd` whose body starts with `flowchart` or
  `graph`. 545 of them have edges.
- The 13 files under `e2e/platform/dev-diagrams/performance/` (up to 434 nodes and 1,244 edges)
  are reported in a separate column, because they swamp the totals.

**Graph (cell profile, compact, DESIGN §6.3).**

| Item | Size |
| --- | --- |
| Node box | label + 4 wide × lines + 2 high, for every shape |
| Spacing | node 2, rank 4, edge 1 |
| Edge label patch | label + 2 wide × lines high |
| Groups | padding 1 on every side; title band 0 (title width + 2 sets the minimum width) |
| Head room | 1 |
| Labels | wrapped at 25 cells; CJK and emoji count 2 |
| Engine | `routing: 'stepped'`, `diagramPadding: 0` |

**Engine constants scaled to cells** (about px / 8, ties rounded up, tolerances scaled exactly):

| Constant | px → cells | Constant | px → cells |
| --- | --- | --- | --- |
| `PORT_SEP` (index) | 20 → 2 | `LEVEL_MARGIN` | 28 → 3 |
| `LOOP` / `LOOP_GAP` | 26 / 6 → 3 / 1 | `LEVEL_PITCH` / `LEVEL_LEAD` / `LEVEL_CLEAR` | 12 / 12 / 8 → 1 / 1 / 1 |
| `CORNER` | 12 → 1 | `LEVEL_TOUCH` | 4 → 0.5 |
| `PORT_PITCH` / `MIN_PITCH` | 16 / 8 → 2 / 1 | `SNAP` / `BEND_SNAP` / `LEAN_CLEAR` | 12 / 24 / 40 → 2 / 3 / 5 |
| `TRACK_MARGIN` / `TRACK_PITCH` / `TRACK_SPREAD` | 18 / 10 / 14 → 2 / 1 / 2 | `IN_LINE` (both files) / `TWIN` | 0.5 / 1 → 0.0625 / 0.125 |
| `FAN` (compound) | 24 → 3 | self-loop label offset (compound.ts:1083) | 28 → 3 |

Ratios and counts were left as they are: `MIN_SLOPE`, `MAX_GAP`, `LEVEL_WIDE`, `CROSSED_SLOPE`,
`TIGHT_*`, `MAX_*` and the sweep counts.

**Snapping.**

- **Box** with centre `c` and size `w`: cells `round(c − w/2) … + w − 1`. Labels and group frames
  are placed the same way.
- **Route point:** cell `round(v − 0.5)`, so a point at a cell centre `k + 0.5` maps to `k`. Ties
  round up.
- **Edge ends** are moved onto the cell just outside their box, on the port side the engine
  reports.

Two variants were run:

- **naive**: as above.
- **careful**: the best you can do after layout without moving boxes.
  - Floats are quantised to 1e-4 first.
  - Each end's along-side coordinate is clamped to a non-corner cell of its side; ties go towards
    the box centre.
  - Every point that shares that float value takes the same cell, so straight runs stay straight.

**Counts.** A count is per segment unless it says cells.

| Count | Meaning |
| --- | --- |
| `segBox` | the segment enters any node box (own end boxes included, since ends sit outside them) |
| `segLabel` | the segment enters another edge's label patch |
| `segFrame` | the segment runs along a group frame (`frameAlong`), or crosses a frame it has no reason to cross (`frameStray`: both ends inside, or both outside) |
| `shareCells` | cells where two edges share an arm (same direction out of the cell), split into `shareSibling` (the two edges share an end node) and `shareUnrelated` |
| `cornerTouch` | two edges in one cell with no shared arm, where at least one turns there, so it reads as a tee or a connection |
| `crossings` | clean perpendicular crossings, for information only; a junction glyph handles them |
| `diagFloat` / `diagSnapped` | non-orthogonal segments before and after rounding |
| `zeroSegs` | segments that collapse to nothing after rounding |
| `endOffSide` | edge ends on a box corner or outside the side |
| `endsShared` | edge ends sharing one cell |
| `halfCentres` | boxes whose float edges are not whole cells |

## Counts

Each cell reads `total in N inputs (% of inputs)`.

### Naive rounding

| Metric | mermaid-ascii fixtures | e2e, excluding perf | e2e perf (13 big) |
| --- | --- | --- | --- |
| Inputs / edges / segments | 88 / 192 / 602 | 593 / 2,416 / 8,404 | 13 / 4,227 / 40,636 |
| segBox | 0 | 5 in 2 (0 %) | 6 in 1 (8 %) |
| segLabel | 0 | 0 | 0 |
| segFrame | 0 | 26 in 4 (1 %) | 45 in 3 (23 %) |
| … frameAlong | 0 | 12 in 4 (1 %) | 43 in 3 (23 %) |
| … frameStray | 0 | 16 in 3 (1 %) | 2 in 1 (8 %) |
| shareCells | 9 in 4 (5 %) | 401 in 40 (7 %) | 12,867 in 8 (62 %) |
| … shareSibling | 7 in 3 (3 %) | 389 in 39 (7 %) | 11,742 in 6 (46 %) |
| … shareUnrelated | 2 in 1 (1 %) | 12 in 2 (0 %) | 1,125 in 6 (46 %) |
| cornerTouch | 0 | 5 in 5 (1 %) | 7 in 2 (15 %) |
| crossings (fine) | 0 | 105 in 44 (7 %) | 51,748 in 11 (85 %) |
| diagFloat | 0 | 0 | 0 |
| diagSnapped | 0 | 13 in 5 (1 %) | 0 |
| zeroSegs | 0 | 24 in 24 (4 %) | 11 in 3 (23 %) |
| endOffSide | 47 in 27 (31 %) | 217 in 96 (16 %) | 460 in 10 (77 %) |
| endsShared | 5 in 3 (3 %) | 191 in 40 (7 %) | 1,577 in 4 (31 %) |
| halfCentres (boxes) | 57 in 31 (35 %) | 867 in 287 (48 %) | 2,785 in 13 (100 %) |
| **Inputs with any defect** | **27 (31 %)** | **120 (20 %)** | **12 (92 %)** |

### Careful snap (best post-layout snap without moving boxes)

| Metric | mermaid-ascii fixtures | e2e, excluding perf | e2e perf |
| --- | --- | --- | --- |
| segBox | 0 | 5 in 2 | 6 in 1 |
| segLabel | 0 | 8 in 7 (1 %) | 0 |
| segFrame | 0 | 26 in 4 (1 %) | 45 in 3 |
| shareCells | 74 in 18 (20 %) | 874 in 68 (11 %) | 27,398 in 8 |
| … shareUnrelated | 2 in 1 | 12 in 2 | 1,895 in 6 |
| cornerTouch | 0 | 5 in 5 | 9 in 4 |
| diagSnapped | 0 | 1 in 1 | 0 |
| zeroSegs | 0 | 20 in 18 (3 %) | 13 in 3 |
| endOffSide | 21 in 14 (16 %) | 63 in 51 (9 %) | 12 in 3 |
| endsShared | 33 in 18 (20 %) | 299 in 69 (12 %) | 1,936 in 6 |
| **Inputs with any defect** | **21 (24 %)** | **111 (19 %)** | **10 (77 %)** |

The careful snap halves the ends off the side, but it does so by clamping several ends into the
same cell. Shared end cells go up 2–6×, and sibling sharing roughly doubles. The number of inputs
with a defect hardly moves (20 % → 19 % on e2e). The defects come from upstream decisions, not
from the rounding rule.

### By direction (all inputs excluding perf, naive)

| Dir | Inputs | Edge ends | Ends off side | Ends sharing a cell | Shared cells | Inputs with an end issue |
| --- | --- | --- | --- | --- | --- | --- |
| TB | 357 | 3,236 | 51 (1.6 %) | 8 | 28 | 33 (9 %) |
| LR | 307 | 1,842 | 189 (10 %) | 154 | 275 | 84 (27 %) |
| RL | 11 | 112 | 23 | 34 | 107 | 11 (100 %) |
| BT | 6 | 26 | 1 | 0 | 0 | 1 |

With the careful snap, LR ends sharing a cell rise to 264 and LR shared cells to 735. Edges
leaving LR nodes are where most of the work is.

## Worst examples

Drawn by the prototype in plain ASCII:

- `+-|` are boxes, edges and turns.
- `:` and `.` are group frames, with the title on the top border.
- `v > ^ <` are heads.
- `@` marks a defect cell: a shared cell, a corner touch, an end off the side, a box or frame hit,
  or the knee of a diagonal.

### 1. Port capacity on LR sides

`e2e/platform/dev-diagrams/layout-tests/labels-long.mmd` (`flowchart RL`,
`a1 & a2 & a3 & a4 --> a5 … a10`; 105 shared cells). Each `aN` box is 3 rows high, so it has one
usable cell on its right side, and four edges arrive there. The engine spread them 1–2 units apart
in float, inside a span of `3 − 2·CORNER = 1`. After rounding they pile onto the same cell and
then run side by side.

```
 +----+
 | a5 |@@@@@@@@@@@@@@@@@@+--------------------------+
 +----+              ||| | I am a node with a super |
         +-----------+++-| long label. I am a node  |
         |+----------+++-| with a super long label. |
 +----+  ||          ||| | I am a node with a super |
 | a6 |@@@@@@@@@@@@@@+++-| long label. I am a node  |
 +----+   || +----++++++-| with a super long label. |
          || |    |||||| | I am a node with a super |
          || |+---++++++-| long label.              |
 +----+   || ||   |||||| +--------------------------+
 | a7 |@@@@@@@@@@+||||||
 +----+    | |||||||||||
```

The same happens in TB with short labels. In `fanout_labels_tb_five`, `A` (5 wide, 3 usable cells)
has five edges leaving it:

```
                +---+
                | A |
                +---+
                 @||@
                 @|||
   +-------------@||+--------------+
   |       +-----+|+------+        |
   |       |      |       |        |
 alpha   beta   gamma   delta   epsilon
```

### 2. Float noise at `.5` ties gives diagonals

`shape-themes/05-connect-all-shapes-with-each-other.mmd` (TB). The route for `n00 → n22` is
`[51, 4] → [51, 9] …` in float, but the first `51` is `50.9999…`. `round(50.4999)` gives 50 and
`round(50.5)` gives 51, so the first segment becomes diagonal. All three edges leaving that side
are hit:

```
                                    +----------------------+
                                    | lined-document shape |
                                    +----------------------+
                                        | |       -@-@-@
                                        | |        | | |
```

### 3. Half-cell boxes: straight edges jog, or end on a corner

`ampersand_lhs.txt` (`graph LR`, `A & B --> C`), careful snap. In float, `A → B` is a straight
horizontal line. `A` and `B` have different half-cell centres, though, so after rounding the line
leaves `A` on its top-right corner. The careful snap cannot keep the line straight and attached to
both side midpoints without moving a box.

```
         +---+
+---+@-->| B |
| A |--+ +---+
+---+  |
       |
       | +---+
       +>| C |
         +---+
```

### 4. Unrelated edges sharing cells

`ampersand_lhs_and_rhs.txt` (`graph LR`, `A & B --> C & D`). `A → D` and `B → C` run down the
same two columns, and two heads meet at `D`'s corner:

```
+---+     +---+
| A |---->| C |
+---+@-++@+---+
       ||
       ||
+---+  || +---+
| B |--@@>| D |
+---+@---@+---+
```

### 5. Edges running along a group frame

`tmp-v12.0.0-faulty-diags/elk-legacy-preset-regression.mmd` (LR, 6 groups), excerpt. Group padding
1 leaves no lane between the nodes and the frame. The fan-out from `mermaid-chart-app` takes its
track on the frame's bottom border, and five ends leave from two cells.

```
  ||   :+----------------------+  |||+---------------------------------
  ||   :| mermaid-chart-app    |@@@@@@---------------------------------
  ||   :| Main web application |    |+---------------------------------
  ||   :+----------------------+@@@++----------------------------------
  ||   :                          |+-----------------------------------
  ||   :..........................@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
```

### 6. Self-loops

The `LOOP` geometry assumes room that does not exist in cells. With `height 3`, `y0 = y − h/4`
and `y1 = y + h/4` land on the top and bottom border rows, so the loop leaves from the box corners.

`layout-tests/self-loop-2.mmd`:

```
       +---@--+
       | A |  |
       +---@--+
```

`visual-check/should-render-self-loops.mmd`: the loop reaches the group frame
(`LOOP 3` = frame padding + 2):

```
             :.B..........:
   +---+---+ :   +----+---@
   | A |   | :   | B1 |   @
   +---+<--+ :   +----+<--@
             :............:
```

### 7. An edge from a group to its own child

`visual-check/5064-…`: `Sub --> In`, where `In` is inside `Sub`. The route starts on `Sub`'s frame
and runs down through `In`:

```
 +-----+
 | Out |
 +-----+
    |
:.Su|..:
:   |  :
:   @  :
:+--@-+:
:| I@ |:
:+--@-+:
:...|..:
```

## Recommendation for #42 (engine `grid` rounding)

**The engine has to round. Snapping after layout is not enough.** The engine makes its alignment
decisions in float: in-line snapping (`SNAP`, `BEND_SNAP`), twin detection, port spreading and
track pitch. Each of those holds only before rounding. Rounding afterwards breaks them in a
measurable share of inputs, and no rounding rule fixes that, as the careful snap shows. With
`grid: 1`, #42 should do the following:

1. **Put box edges on the grid, not centres** (DESIGN §6.3 already says this). Place each box's
   left and top edges on whole cells and derive the centre from them. An odd width then has its
   centre at `k + 0.5`, and port cells are whole cells inside the side. This removes the half-cell
   jogs and the ends on corners (example 3). 48 % of inputs have such boxes today.
2. **Allot ports in whole cells, inside `[side start + 1, side end − 1]`.** `portPitch` is 2
   (one blank cell between ends) and `minPitch` is 1. When a side has more ends than cells, the
   engine has to decide something; see open question 1. Do not leave this to the router: the
   router cannot widen a box.
3. **Give tracks and levels distinct whole rows or columns.** Grow the gap when they don't fit,
   with `trackPitch` 1. Today 4 % of inputs have tracks within one cell of each other, which
   collapse to nothing (`zeroSegs`), and their runs merge.
4. **Emit exact integers (or `k + 0.5`)** for every route coordinate, from the same rounded value
   for every point of a run. That removes the tie-noise diagonals (example 2). The `snapRoute`
   in #45 should still quantise before rounding, as a cheap guard.
5. **Self-loops in cells.** With the cell profile, a loop should leave from the middle row and
   return on the next side, or leave from a side midpoint and come back on the far side of the
   same edge; it should not take `y ± h/4`. Grow the box's reserved width by `loop + 1` inside a
   group, so the loop stays off the frame (example 6). That can be a `loop` metric plus a
   cell-specific loop shape in `index.ts`. It is easier there than in the router.
6. **Group padding 1 needs a lane.** Edges that leave nodes next to a frame take tracks on the
   frame row (example 5). Either reserve `padding ≥ trackMargin` around group content in the
   cell profile (padding 2 on the sides that edges leave), or let #45 move those runs. The first
   is cheaper and more predictable.

## What the repair router (#45) has to cover

If #42 does the above, these are the cases left after snapping, by frequency on the normal
(non-perf) inputs:

| Case | Frequency (naive) | What repair must do |
| --- | --- | --- |
| Siblings sharing cells (fan-in/fan-out from one node) | 7 % of inputs (389 cells) | Decide **merge or separate**. Merging into a bus with tees, as mermaid-ascii does, is readable for one source with several targets or several sources into one target, if the heads stay distinct. Otherwise re-route one edge onto a free parallel lane. This is the most common case. |
| Unrelated edges sharing cells | about 0.3 % of inputs (2), 46 % of the large ones | A\* over free cells with edge occupancy as a cost, not a wall, so that it can still cross perpendicularly. |
| Runs along a group frame | 1 % of inputs | Treat the frame line as blocked for runs, but allow crossings where the edge has to cross the frame. |
| Frame crossed with no reason | 0.5 % of inputs | Same: frames are walls except where one end is inside the group. |
| Corner touches (tees that read as connections) | 1 % of inputs | Treat a cell where another edge turns as blocked; perpendicular crossings through straight cells stay allowed. |
| Edge from a group to its own member (example 7) | rare | Treat the member's box as a wall. The route has to enter from the frame side nearest the member. |
| Segment through a box | 2 inputs, both self-loops or group-to-member | Covered by the two rows above, plus self-loop geometry in #42. |
| Segment through an edge label | 0 (naive), 1 % (careful) | Keep it in the cost model (label patches are walls), but expect it to be rare. |
| Diagonal after snapping | 1 % now, 0 with #42 item 4 | Not a router case: `snapRoute` should quantise and then repair the knee. |

Sizing notes for #45:

- **Bound the search.** The perf inputs reach 5,875 × 71 and 3,270 × 1,343 cells, with up to
  12,867 shared cells. Unbounded A\* per colliding segment over grids of millions of cells is too
  slow. Search a window around the segment, grown up to a cap. If no route is found, keep the
  snapped route and report it (a warning, or a property-test allowance). D78's "repairs only
  colliding segments" holds for normal inputs: 80 % have no collision at all.
- **Repair segments, not whole edges.** On normal inputs the collisions sit next to the edge ends
  (port crowding) or on one track. Re-routing from the last clean point before the collision to
  the first clean point after it keeps most of the engine's route.
- **Fix the order.** Process edges in model order and mark each repaired path as occupied before
  the next one is processed. Output stays deterministic (R-ARCH-6).

## Open questions

1. **Too many ends for one side.** A one-line LR node has one port cell per side. Three options:

   | Option | Result | Cost |
   | --- | --- | --- |
   | (a) The builder grows the box | height = max(lines + 2, 2k + 1) for k ends on the busiest LR side | Taller LR boxes; changes the look |
   | (b) The engine bundles ends deliberately | One cell, a junction, then fan out | Like mermaid-ascii; needs a rule for mixed in and out ends |
   | (c) Ends spill onto the top and bottom sides | Uses the free sides | Complex, and it breaks the flow direction |

   The prototype suggests (b) for ≤ 3 ends, which keeps boxes compact, and (a) beyond that. The
   choice belongs in the #42 or #45 spec before either is built.
2. Should sibling buses count as a defect in the ASCII property tests, or as an allowed form with
   its own glyph rules (D79 tees)?

## Caveats

- **Every shape was sized as a plain box.** Shapes with more padding (diamond, circle) may differ.
- **Group padding is approximate.** It was set to 1 on every side and the title band to 0. The
  engine treats `title.height = 0` as no band, so the title costs width only.
- **The scaled constants were chosen by hand.** They are a first guess for the cell profile
  (D77), not tuned values. Tuning `PORT_PITCH`, `TRACK_MARGIN` and `LEVEL_*` changes the sibling
  sharing and `zeroSegs` counts. It cannot change the LR port-capacity result, which is
  geometric.
- **Edge labels are measured in a simple way.** HTML is stripped, `<br>` is split, and the text
  is wrapped at 25 cells. Markdown is not parsed.
