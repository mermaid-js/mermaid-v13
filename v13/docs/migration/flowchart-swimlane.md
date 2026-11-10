## Swimlane diagrams

`swimlane-beta` renders again, through the flowchart plugin with the `swimlane` layout engine
(D534). It is flowchart's syntax, parser, AST and language support with another layout; each
top-level subgraph is a lane, and nodes outside every subgraph go to one default lane.

- **Detection and type.** v12's detector, `swimlane-beta` at a word boundary, in v12's place
  (after `sequenceDiagram`, before `graph`/`flowchart`). `detectType` and `diagramType` report
  `swimlane`, as in v12. `@mermaid-js/diagram-flowchart` draws it; nothing else needs installing.
- **Layout.** The default layout is `swimlane`, a default below every config layer: `layout:
  dagre` (or `layered`) at the top level, in `swimlane.layout`, in front matter or in a
  directive moves a swimlane diagram onto layered, as v12's `swimlanesDiagram.spec.ts` asserts.
  `swimlane-beta` may also take `elk` (D535). Any graph diagram may select `layout: swimlane`
  too (D535).
- **Config.** `swimlane` is the diagram's section on top of flowchart's. Lowest first:
  flowchart's defaults, swimlane's defaults, the author's `flowchart.*`, the author's
  `swimlane.*` (in each source; a later source, front matter or a directive, still outranks
  `initialize()`). So `flowchart.layout: elk` or `flowchart.theme` moves a swimlane diagram
  unless `swimlane.layout` / `swimlane.theme` is set too, and a key both sections have
  (`useMaxWidth`) resolves the same way in both. An `%%{init: {"config": …}}%%` key goes to
  `swimlane` when that section has it, else to `flowchart` (v12 sent all of it to `swimlane`).
  The engine reads `swimlane.ignoreCrossLaneEdges`,
  `optimizeRanksByCrossings`, `automaticLaneOrdering` and `lineHops`; `flowchart.*` keys
  (spacing, curve, labels, padding) apply as in v12.
- **Curve.** Edges draw `rounded` unless the author sets a curve. v12's engine forced `rounded`
  when the curve was unset or `basis`; in v13 an author's `flowchart.curve` (`basis` included)
  or `linkStyle default interpolate` wins.
- **Lanes** draw as v12's swimlane cluster: `g.cluster.swimlane` holding `rect.swimlane-body`
  (unfilled) and `rect.swimlane-title` (filled `clusterBkg`), both stroked `clusterBorder`,
  then the label. The title band is on top for `TB` and `BT`, and on the left, its label turned
  to read upward, for `LR` and `RL`. **Fixed:** v12 turned only `LR`, so `RL` lanes got a top
  band over a left-reserved layout; in v13 `RL` matches `LR` (D536). The default lane (nodes
  outside every subgraph) has no label, `data-id="__swimlane_default__"` and the palette slot
  after every subgraph's, as in v12. A subgraph inside a lane is a plain subgraph box. The
  same lanes draw for any flowchart with `layout: swimlane` (D535).
- **Lane colours.** In the colour themes (`redux-color`, `redux-dark-color`) each lane takes
  flowchart's per-subgraph palette slot (`data-color-id`) on both halves, stroke and, where the
  theme has a background palette, fill: what v12's `[data-color-id]` lane rules drew, now as
  attributes. An author's `style` or `classDef` still wins. Lanes have no drop shadow (v12
  turned it off), and a lane without a slot is stroked `clusterBorder`, never the neo gradient.
  No new theme variables. With the hand-drawn plugin both halves are sketched (D301).
- **Long lane titles.** v12 let a lane title wider than its lane run past it; v13 widens the
  lane across the flow to the title plus 20px each side.
- **Warnings** (D226, D536), raised at layout and only when the `swimlane` engine lays the
  diagram out, where v12 only logged: `SWIMLANE_SHARED_NODE` for a node (or subgraph) listed in two lanes, directly or in a
  subgraph nested in one (it stays in the first;
  `astIds` names both lanes) and `SWIMLANE_NESTED_LANE` for each subgraph nested in a lane
  (`astIds` names it). **Changed:** v12 removed a lane that a shared node left empty; v13 draws
  it as an empty lane, so every subgraph stays in the SVG with its `data-ast`.
- **`format: 'ascii'`** (new; v12 had no text output) draws the flowchart with `layered`, lanes
  as plain subgraph frames with no title band or default lane, in both charsets, with one
  `ASCII_DROPPED` warning (`feature: 'layout'`) and no `SWIMLANE_*` warning, as for any engine
  text output does not use (D179, D534); a flowchart with `layout: swimlane` draws the same.
