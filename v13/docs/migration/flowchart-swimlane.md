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
  (`theme`, `layout`, `useMaxWidth`, `useWidth`) resolves the same way in both. An
  `%%{init: {"config": …}}%%` key goes to `swimlane` when it is one of swimlane's own keys
  (`theme`, `layout`, `useMaxWidth`, `lineHops` and the three below), else to `flowchart` (v12
  sent all of it to `swimlane`). `flowchart.*` keys (spacing, curve, labels, padding) apply as
  in v12. `swimlane.look` is ignored, as `look` is everywhere (D153).
- **Engine keys**, all honoured as in v12: `swimlane.ignoreCrossLaneEdges` (default `true`:
  each lane is ranked on its own edges), `optimizeRanksByCrossings` (default `true`; as in v12
  it acts only when `ignoreCrossLaneEdges` is `false`) and `automaticLaneOrdering` (default
  `false`: lanes keep their source order; `true` reorders them so busy lanes sit together).
- **Curve.** Edges draw `rounded` unless the author sets a curve. v12's engine forced `rounded`
  when the curve was unset or `basis`; in v13 an author's `flowchart.curve` (`basis` included)
  or `linkStyle default interpolate` wins.
- **Lanes** draw as v12's swimlane cluster: `g.cluster.swimlane` holding `rect.swimlane-body`
  and `rect.swimlane-title`, both filled `clusterBkg` and stroked `clusterBorder`, then the
  label. v12 wrote `fill="none"` on the body but its `.cluster rect` CSS filled it; v13 fills
  it in every look, the default lane too, and the hand-drawn look hachures it (D768). The title band is on top for `TB` and `BT`, and on the left, its label turned
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
- **Markdown in lane titles only in markdown strings** (D710). v12 read a lane title as
  Markdown, so `subgraph lane1 ["**Bold** lane"]` drew `Bold` bold. Now only a title wholly in
  backticks is read as Markdown, with or without double quotes around them
  (`` ["`**Bold** lane`"] `` or `` [`**Bold** lane`] ``), and is drawn without its backticks; in
  any other title `**`, `_` and backticks are drawn as written. Wrap the title in `` "`…`" `` to
  keep the old look. `<br>`, the drawn tags (`<b>`, `<i>`, `<u>`, `<s>`, `<sub>`, `<sup>` and
  their synonyms) and entity codes work in every lane title. A subgraph nested in a lane, and a
  flowchart subgraph, keep flowchart's reading, where only `` "`…`" `` is a markdown string.
- **Long lane titles.** v12 let a lane title wider than its lane run past it; v13 widens the
  lane across the flow to the title plus 20px each side.
- **Warnings** (D226, D536), raised at layout and only when the `swimlane` engine lays the
  diagram out, where v12 only logged: `SWIMLANE_SHARED_NODE` for a node (or subgraph) listed in two lanes, directly or in a
  subgraph nested in one (it stays in the first;
  `astIds` names both lanes) and `SWIMLANE_NESTED_LANE` for each subgraph nested in a lane
  (`astIds` names it). **Changed:** v12 removed a lane that a shared node left empty; v13 draws
  it as an empty lane, so every subgraph stays in the SVG with its `data-ast`.
- **Edge labels are tags**, as in flowchart (D626–D630): a rounded box bordered 1 px solid in
  the edge's colour and filled opaque with `edgeLabelBackground` (the theme background unless
  set), the same inside a coloured lane. Edges reserve the matching room.
- **Line hops** (D537). Crossing edges hop by default under the swimlane engine
  (`swimlane.lineHops`, default `arc`; `gap` cuts the run that gives way instead, `false` draws
  it unbroken), as in v12. The shared top-level `lineHops` is new and off by default (D689),
  so it changes nothing here unless set: `lineHops: false` turns hops off everywhere, swimlane included, and an author's `swimlane.lineHops` beats the top-level
  key under this engine. Crossings are found on straight runs only, as in v12: a rounded corner
  or a smoothed curve is never hopped, and unlike v12 the corners of an edge that hops keep
  their rounding. Also unlike v12, crossings on one run too close for a hop each (closer than
  about 7px) share one merged hop, as tall as the others, where v12 drew none (D650, #793).
- **Layout differences from v12's engine** (D532: the engine is v12's, ported; these are the
  places it differs):
  - An empty lane, or one a shared node left empty, gets a band of its own (its title's width
    plus padding across, the other lanes' length along); v12 shrank it to nothing.
  - A subgraph inside a lane grows by its own padding on each side; v12 split one padding
    between the two sides, so nested boxes are a little larger.
  - Lanes grow so that routes and edge labels stay 10px inside them; with flowchart's 20px
    subgraph padding, v12's outer routes ran along the lane border.
  - `LR` and `RL` route on the drawn (turned) sizes; v12 routed `RL` with `TB` widths, so its
    detours could miss boxes or cut through them.
  - Labelled self-loops are routed through their label, and unlabelled ones take a free side;
    v12's router skipped self-loops. A route end v12 left off its box is put back on it.
  - A labelled edge to or from a subgraph puts its label in the row of its ranked end, beside
    that lane's nodes; v12 put it on top of the other end.
- **Integrators.** Lane drawing is flowchart's own lazily loaded part, `flowchartLanes`
  (`@mermaid-js/diagram-flowchart/lanes`), loaded alongside the `swimlane` engine for
  flowcharts only, so a plain flowchart, or a class diagram with `layout: swimlane`, loads none
  of it. `render()`, `prepare()` and `preload({ types: ['swimlane'] })` load both; for a
  `flowchart` with `layout: swimlane`, `preload({ layouts: ['swimlane', 'flowchartLanes'] })`.
  Lanes are drawn only on a render mermaid's own `swimlane` engine laid out: an engine
  registered under another name, or a loader registered under `swimlane` itself, draws the
  groups as plain subgraphs, and a placeholder render that lacks the part says so in its
  `PLACEHOLDER` warning. A plugin's `layoutParts` is first-party only: any other entry is
  ignored.
- **`format: 'ascii'`** (new; v12 had no text output) draws the flowchart with `layered`, lanes
  as plain subgraph frames with no title band or default lane, in both charsets, with one
  `ASCII_DROPPED` warning (`feature: 'layout'`) and no `SWIMLANE_*` warning, as for any engine
  text output does not use (D179, D534); a flowchart with `layout: swimlane` draws the same.
