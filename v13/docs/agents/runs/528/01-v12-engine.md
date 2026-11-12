# v12 swimlane engine: pointer notes

**Source of the port (D532):** upstream `develop` at `c9b12739f`, which is not in this repo. Read it from the upstream clone: `git -C /Users/ashishj/repos/mermaid show c9b12739f:packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/<file>` (list with `git -C … ls-tree -r --name-only c9b12739f packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/`). Read only; never write in that clone. `fa796a943` (in this repo) is the older v12 base, without #8670 and some 12.3.0 fixes: don't port from it.

Engine root below: `E = packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/`. 111 files at the cut-off; about 12,900 lines of source.

## Entry and data flow

- `E/index.ts`: `prepareLayoutForSwimlanes` (helpers) → `createEdgeLabelNodes` (edge labels become label nodes routed through) → `runSwimlaneLayoutCore` → after paint `applySwimlaneLineJumps` (`adjustLayout.ts`, v12's DOM line jumps: T0c's concern, not the engine's).
- `E/layoutCore.ts` (58 lines): `toGraphView(data)` → `sugiyamaLayout` (`pipeline.ts`) → `writeBackToLayoutData` → `routeEdgesOrthogonal(data, direction)` (`orthogonalRouter/router.ts`) → curve `basis`→`rounded` (v13: flowchart's prepare, T1) → `postProcessSwimlaneLayout` (`postProcessing.ts`) → `validateSwimlanesLayout`.
- Config read: `flowchart.nodeSpacing` (40), `flowchart.rankSpacing` (100), `swimlane.ignoreCrossLaneEdges` (true), `swimlane.optimizeRanksByCrossings` (true), `swimlane.automaticLaneOrdering` (false). v13: spacing from `graph.spacing`, tuning from `ctx.config.swimlane`.
- The engine mutates v12's `LayoutData` (nodes with `isGroup`, `parentId`, `padding`, `x`/`y` centres, `width`/`height`; edges with `start`/`end`, `points`, `label`). Router and post-processing read and write it directly.

## Files by ticket

- **T0a (phases through coordinates):** `helpers.ts` (470; lane rules at about 120–206, `toGraphView`, `writeBackToLayoutData`, `DEFAULT_SWIMLANE_ID`, lane title band 21px), `lanes.ts` (98, `buildLaneModel`), `laneOrdering.ts` (196), `edgeLabelNodes.ts` (132), `config.ts` (78), `pipeline.ts` (77), `phase0.helpers.ts`, `phase1.cycles.ts`, `phase2.*.ts` (10 files), `phase3.ordering.ts` (279), `phase4.coordinates.ts` (380), `driving-tree.ts` (277, check whether anything still imports it).
- **T0b (router, post-processing):** `orthogonalRouter/router.ts` (2,382), `postProcessing.ts` (174), `direction/*.ts` (14 files; `materializedGeometry.ts` 2,834), `direction/validation.ts`.
- **Not ported (D531):** `anchoredNodes.ts` (476) and every pool branch (`laneRole`, `laneIndex`, `anchorTo`); specs `anchoredNodes*.spec.ts`, `laneTitleBands.pooled.spec.ts`, `lrTransform.anchorFootprint.spec.ts`.

## Specs (64 files at the cut-off)

- Unit specs: `E/__tests__/*.spec.ts`, `E/direction/geometry.spec.ts`, `E/phase2.layering.spec.ts`, `E/orthogonalRouter/__tests__/raykov.*.spec.ts`. Helpers: `__tests__/{faceGeometry,routeTouches,viewerMeasuredSizes,viewerSizedLayout}.ts`.
- DDLT specs: `E/*.ddlt.spec.ts` (14). Their fixtures are already in this repo: `dev-diagrams/layout-tests/swimlanes/` (`.mmd`, `.sizes.json` captured in v12, `ddlt-manifest.json` if present, `regressions/`). Known level-1 failures in v12: `commant`, `12-…`, `13-…`.
- v13's DDLT model: `packages/core/src/layout/tree/tree.ddlt.spec.ts`.

## Corpus

`e2e/diagrams/swimlanes/` (50 `.mmd`, all `swimlane-beta`). Lane drawing in v12: `git show fa796a943:packages/mermaid/src/rendering-util/rendering-elements/clusters/swimlane.js`; line jumps `…/rendering-elements/lineJump.ts`; diagram `git show fa796a943:packages/mermaid/src/diagrams/swimlanes/`.

## v13 seams

- Contract: `packages/core/src/layout/types.ts` (`LayoutGraph`, `LayoutModel`, `LayoutEngine`, `RoutePoint`). Lazy engine model: `packages/core/src/layout/tree/` and the `./layout/tree` export in `packages/core/package.json` (plus `tools/workspace/layout.spec.ts`'s list).
- Registry: `packages/mermaid/src/registry.ts` (`LAZY_LAYOUTS` at about 202, D285 gate in `find()` at about 906).
- Chunk gate: `packages/bench/src/core-chunks.spec.ts` (tree's lazy-chunk case at about 134); core size `packages/bench/src/core-size.spec.ts` (`measureCoreSize`), CDN `packages/mermaid/src/cdn-build.spec.ts`. Budget 98,304 B gz (D546).
- Config: `packages/core/schema/config.schema.yaml` (`swimlane` section at about 4419; statuses `pending`).
- ELK hops: `packages/layout-elk/src/hops.ts`, `index.ts:60-70` (`postRender`).
