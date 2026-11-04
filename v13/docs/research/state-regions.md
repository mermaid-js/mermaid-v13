# Concurrency regions in the layered engine: prototype findings

Issue #140 (spec #127, D111). The question: can core's `layered` engine place `--` concurrency
regions side by side inside their composite, using only today's `LayoutGroup` machinery? If not,
the state layout (#144) needs a state T0 (D102).

The prototype was throwaway: `v13/throwaway/140-state-regions/regions.ts`, deleted when the
state layout (#144) landed; it is in git at `af5ebb2cd`. Its region checks live on in
`packages/conformance/src/state/layout.spec.ts`.

## TL;DR

- **Verdict: adopt the nested-group model, with one named workaround. No state T0 is needed.**
- Model each region as a `LayoutGroup` whose `parent` is the composite's group. Give regions no
  title and no edges between them. The engine then places the regions side by side across the
  composite's flow on every corpus fixture: 29 of 29 files, 9 distinct bodies. This holds with
  curved, stepped and grid (`grid: 1`) routing. It also holds for 15 of the 17 synthetic stress
  cases: 2–4 regions, very different sizes, regions three levels deep, `direction` TB/LR/BT/RL,
  transitions into and out of a region, self-loops and wide labels.
- **The two failures have one cause: a transition between two sibling regions of one composite**
  (`A2 --> B1`, where `A2` is in region 0 and `B1` in region 1). The composite's level then sees
  an edge between two region boxes, so it ranks them, and they stack along the flow. UML does not
  allow such a transition. v12 accepts it, but no corpus fixture has one.
- **Workaround W4 (builder side, no core change), not adopted (D113):** leave sibling-region
  edges out of the graph the engine gets, and have the builder draw them after layout. W4 fixes
  the region invariants in both cases, but in S17 its straight line runs through a node. The
  maintainer chose v12's behaviour instead: these edges go to the engine like any other edge, and
  the regions stack. No special handling, no warning.
- **The builder must also stretch the region frames for drawing** (no layout change). Each
  region's frame is only as big as its own content, and the engine centres the frames along the
  flow. To draw dividers that span the whole composite, the builder stretches every region along
  the flow to the composite's inner extent. That is safe: once a composite has a `--`, all of its
  members sit in regions. With the stretch, `validateLayout` stays clean everywhere the plain
  model passes.

## Model

| Item | Value |
| --- | --- |
| Composite | `LayoutGroup`, padding 8, title band 18 × label width, `direction` from `direction X` inside it |
| Region | `LayoutGroup` with `parent` = composite, padding 8, no title, no direction (inherits) |
| Members | `parent` = their region; with no `--` they sit in the composite directly |
| `[*]` | a 14 × 14 node per scope (region, composite or root), `<scope>_start` / `<scope>_end` |
| State | label × 8 + 16 wide, 40 high |
| Edge label | text × 8 + 16 wide, 24 high |
| Spacing | node 50, rank 50, edge 20, `diagramPadding` 8 (v12 defaults) |

v12 makes the same split. `stateDb.docTranslator` turns each `--` region into a sibling
`divider` container inside the composite (v12 `dataFetcher`).

No state parser exists yet, so the prototype builds each `LayoutGraph` with a small line reader.
It handles transitions, `state X {}`, `--`, `direction`, `[*]` and bare states. It skips notes,
`classDef`/`class` and `acc*` lines, which do not affect region placement. Sizes are
approximations, not measured text. The question is about structure, so this does not change any
verdict.

## Checks

Each run must give an empty `validateLayout` result. That covers: finite coordinates, everything
inside the drawing, no overlaps, every member inside each of its groups (so each region sits
inside its composite), and edges starting and ending at their boxes. On top of that, for each
composite with regions, it checks:

- **Side by side:** each pair of regions is disjoint across the composite's flow (x for TB/BT,
  y for LR/RL) and overlaps along it. The checker tells apart *stacked* (disjoint along the
  flow), *interleaved* (overlapping both ways) and *no shared band*.
- **Divider room:** there is a gap of at least 1 px between neighbouring regions.
- **Region-local edges:** an edge with both ends in one region never enters a sibling region.
- **Edges:** no route runs through a node that is not one of its ends.
- **Labels:** no edge label straddles a group frame (`validateLayout` already keeps labels off
  nodes).

The flow direction the check uses is the one the engine actually applies. The engine follows
v12's rule (`inheritCrossedDirections`): an edge that crosses a group's border drops that
group's `direction`, and the group inherits its parent's. If this changes the direction the
fixture asked for, the run gets a note (¹).

Soft notes (¹), which do not count as failures:

- regions are out of declaration order;
- the direction the fixture asked for differs from the one the engine applied.

## Variants

| Variant | What it does |
| --- | --- |
| nested | the model above, curved routing |
| +stretch | nested, then the builder stretches region frames along the flow (drawing pass) |
| stepped | nested, `routing: 'stepped'` |
| grid | nested at a rough cell profile, `grid: 1` |
| W1 | every composite and region states its intended `direction` explicitly |
| W2 | an edge that crosses into a region ends at that region's frame instead of its member |
| W3 | invisible ordering edges `r0 → r1 → …`, to pin region order |
| W4 | edges between sibling regions are left out of the engine's graph; the builder draws them |

## Results

¹ soft note: regions out of declaration order, or the engine dropped a `direction` (see
Checks). **fail** means at least one hard problem.

| Fixture | nested | +stretch | stepped | grid | W1 | W2 | W3 | W4 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `state-diagram-v2/nightly-check/concurrency-composite-containers-handdrawn-look-redux-color-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrency-composite-containers-handdrawn-look-redux-dark-color-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrency-composite-containers-redux-color-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrency-composite-containers-redux-dark-color-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrency-composite-containers-redux-dark-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrency-composite-containers-redux-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrent-states-neo-look-neo-dark-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrent-states-neo-look-neo-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrent-states-neo-look-redux-dark-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/concurrent-states-neo-look-redux-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/dark-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/default-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/forest-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/neutral-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/regions-inside-nesting-composite-containers-redux-color-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/regions-inside-nesting-composite-containers-redux-dark-color-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/regions-inside-nesting-composite-containers-redux-dark-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/regions-inside-nesting-composite-containers-redux-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/should-align-dividers-correctly.mmd` | pass | pass | pass | pass | pass | pass | **fail** | pass |
| `state-diagram-v2/nightly-check/user-styled-with-regions-composite-containers-redux-color-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/user-styled-with-regions-composite-containers-redux-dark-color-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/user-styled-with-regions-composite-containers-redux-dark-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/nightly-check/user-styled-with-regions-composite-containers-redux-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram-v2/pr-check/v2-should-render-concurrency-states.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram/nightly-check/dark-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram/nightly-check/default-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram/nightly-check/forest-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram/nightly-check/neutral-theme.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| `state-diagram/pr-check/should-render-concurrency-states.mmd` | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| S1 two regions | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S2 three regions, sizes 1/6/fan | pass | pass | pass | pass | pass | pass | **fail**¹ | pass |
| S3 wide vs tall | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S4 nested composite with regions | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S5 transition into a region | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S6 transition out of a region | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S7 transition between regions | **fail** | **fail** | **fail** | **fail**¹ | **fail** | **fail** | **fail** | pass |
| S8 direction LR composite | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S9 direction TB composite in LR diagram | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S10 LR diagram, composite inherits LR | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S11 LR composite with transition into a region | pass¹ | pass¹ | pass¹ | pass¹ | pass¹ | pass¹ | **fail**¹ | pass¹ |
| S12 labels and self-loops in regions | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S13 four levels, regions at each | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S14 BT and RL composites | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S15 edges to the composite and into a region | pass | pass | pass | pass | pass | pass¹ | **fail** | pass |
| S16 region member to its own composite | pass | pass | pass | pass | pass | pass | **fail** | pass |
| S17 sibling-region edge, bigger regions | **fail**¹ | **fail**¹ | **fail**¹ | **fail**¹ | **fail**¹ | **fail**¹ | **fail**¹ | **fail** |

The corpus rows are the 29 `.mmd` files under `e2e/diagrams/state-diagram{,-v2}/` with a `--`
line. They have 9 distinct bodies; the rest are theme and look variants.

## What fails and why

- **S7 and S17: transition between sibling regions.** The compound layout lays out each group as
  its own level, with its children as boxes. An edge between members of two sibling regions
  becomes an edge between the two region boxes at the composite's level. `LayoutEdge.minLen` is
  at least 1, so the edge ranks the regions and they stack along the flow. W1 and W2 do not
  change that edge. W4 removes it. In S17 the builder's straight line then cuts through a state
  in the middle region (`A0 → D2` runs through `B1`).
- **W3: ordering edges always fail.** The same `minLen ≥ 1` rule applies. `LayoutGraph` has no
  "same rank" or "order within a rank" hint, so any edge between regions stacks them. Region
  order does not need one anyway: with no crossing edges the engine keeps declaration order on
  every fixture.
- **S11: `direction LR` composite with a transition into a region (soft).** The crossing edge
  drops the composite's LR, so the engine lays it out TB. The regions are then side by side
  across TB, which is correct for the direction applied. v12 does the same: a subgraph linked to
  the outside ignores its direction. W1 cannot keep LR, because the engine drops the direction
  whatever the input says. The regions also swap order here, because crossing minimisation pulls
  the target region toward the outside node.
- **S15 under W2 (soft):** pointing the crossing edge at the region frame swaps the region order.
  W2 brings no benefit anywhere else, so do not adopt it.
- **Frame alignment** (an observation, not a check): regions of different sizes get frames of
  different sizes, centred along the flow. In S2 the frames' near edges differ by 225 px. The
  +stretch pass fixes the drawing, and the corpus regions of equal shape come out aligned already.

## Recommendation for #144 (state layout)

1. Build regions as nested `LayoutGroup`s, exactly as in the Model section above. Use no core
   change and no new `LayoutGraph` field.
2. After `ctx.layout()`, stretch the region frames along the flow to the composite's inner
   extent. Draw a divider in the middle of each gap between neighbours, across the full
   composite. Dividers come from the region boxes; they are not engine output.
3. Pass edges between sibling regions to the engine like any other edge, with no special
   handling and no warning (D113). The regions then stack along the flow, as in v12. S7 and S17
   are expected to fail the side-by-side check; #144's DDLT region checks skip composites with
   such an edge.
4. Do not adopt W1, W2, W3 or W4. Accept the v12 rule that a crossing edge drops a composite's
   `direction`; this is parity, not a defect.
5. Keep the region checks above (side by side, divider room, region-local edges) as DDLT checks
   in #144's layout tests, next to `validateLayout`.

## If the engine should route sibling-region edges later (not a T0 now)

The smallest contract that would fix S7/S17 in the engine is an edge flag that keeps an edge out
of ranking and ordering at every level, while still routing it. For example,
`LayoutEdge.rank?: false`: the edge gets no rank constraint, but gets a route between its ends
after placement. Flowchart has no use for it today. Raise it as a T0 only if a user report shows that stacked regions
are not good enough (D113 chose v12's stacking).
