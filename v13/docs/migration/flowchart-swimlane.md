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
  `swimlane-beta` may also take `elk` (D535). The engine loads lazily: `render()` loads it, and
  for `renderSync` `prepare()` or `preload({ types: ['swimlane'] })` with `layouts: ['swimlane']`
  does. Any graph diagram may select `layout: swimlane` too (D535).
- **Config.** `swimlane` is the diagram's section on top of flowchart's: `swimlane.layout` and
  `swimlane.theme` scope it, an `%%{init: {"config": …}}%%` key goes to `swimlane` as in v12,
  and the engine reads `swimlane.ignoreCrossLaneEdges`, `optimizeRanksByCrossings`,
  `automaticLaneOrdering` and `lineHops`. `flowchart.*` keys (spacing, curve, labels, padding)
  still apply, as in v12.
- **Curve.** Edges draw `rounded` unless the author sets a curve. v12's engine forced `rounded`
  when the curve was unset or `basis`; in v13 an author's `flowchart.curve` (`basis` included)
  or `linkStyle default interpolate` wins.
- **Lanes** draw as flowchart's subgraph clusters for now; v12's title bands, lane palette and
  the shared-node and nested-lane warnings come with lane drawing (D536).
- **`format: 'ascii'`** draws the flowchart with `layered`, lanes as plain groups, with one
  `ASCII_DROPPED` warning (`feature: 'layout'`), as for any engine text output does not use
  (D179, D534).
