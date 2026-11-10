# Gaps (spec #528)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #593 T0a engine skeleton
- **Choice:** empty lanes get a band of their own in source order (v12 shrinks them to 0×0, which `validateLayout` rejects).
- **Choice:** a nested group grows by its own padding on each side (v12 split one padding between both sides); `nestedGroupSizing` expects twice the padding.
- Fix per D536: RL keeps the title band on the left and BT on top (v12 flipped them to right and bottom); the band grows with a taller measured title.
- `PEER_LAYOUTS = {'swimlane'}` exempts swimlane from D285 for every diagram, mindmap included (D535, D327). Compass (#590) adds `'compass'` to the same set.
- Not ported: v12's "one definition of a lane" source scan (core specs have no Node file APIs); shared-node lint (one `parent` per node in `LayoutGraph`; T2's warning comes from flowchart's model).

## #595 T0b router and post-processing
- Closed: labelled self-loops route through their label (`selfLoops.ts`, v13-only; v12's router skipped self-loops).
- **Knut, 2026-11-10: fix #634 and #636** (no D538 extension), in #651: a failing spec first for each, then off `KNOWN_FAILURES`, so `ddlt.spec.ts` keeps only v12's allowance. Fixed on `feature/634_swimlane-router-fixes` (merged here): `KNOWN_FAILURES` is empty; failing specs first in `__tests__/ddltRegressions.spec.ts`.
  - #636: the destination tail swap is refused through a node; **new behaviour (for the maintainer):** `straightenAlignedCrossLaneEdges` also draws two opposite edges between aligned nodes in different lanes as two straight lines 12 px apart (otherwise they doubled back across each other).
  - #634: new pass `liftRailsOffForeignEdgeLabels` moves an inner rail off another edge's label by 6 px when that adds no hit or crossing.
  - Swimlane chunk 44,914 → 45,686 B gz; core unchanged.
- **#639 merged into `mermaid-v13` as 76f2e0ad1** with #634 and #636 still pinned in `KNOWN_FAILURES`, no D-id yet, both issues open. Kept under "For the maintainer" in #651.
- **Unmet (listed, with issues):** D538's gates fail on two fixtures that are not v12's known failures, each pinned to its exact issue text in `KNOWN_FAILURES` (`ddlt.spec.ts`): `5-car-fun-sales-wide-tb` (#634, border hugging on a wider v13 label), `pebr-2-edge-intrudes-lane-label` (#636, narrowed to one edge: `swapDestinationTerminalTailsToReduceCrossings` swaps a tail onto a rail through Dep1.Proc2; v12 never ran it). `6-legal-constr-sales` (#635) was fixed in T0b by `turnedRouting.ts` (LR/RL route on drawn sizes; RL used TB widths, an upstream bug too). **Needs a D-id:** D538 allows only v12's three. Either extend D538 to these two with #634 and #636 as tracking issues, or fix them before T0b merges. Any that is cheap to fix in T0b is fixed instead of listed (pebr-2 looks like a router bug, not a measurement difference). No other gate is loosened or skipped.
- v12's three known failures (`commant`, `12-…`, `13-…`) pass every gate with v13's sizes, so no issue was filed; all 40 fixtures are gated, the D538 allowance documented in the spec.
- **Choice:** `terminalReattach.ts` (v13-only) puts route ends back on their box where v12's LR routing (TB coordinates, unturned sizes) left them off; core's `validateLayout` rejected HoE and `pebr-2` otherwise.
- **Choice:** `laneFit.ts` (v13-only) grows lanes around the final routes: flowchart's 20 px group padding (v12 8) put outer rails on the lane border.
- **Choice:** ported files carry a file-level `eslint-disable` for readability rules only (line counts, complexity, depth), per D532.
- `routeTouches` has new unresolved touches in 3 fixtures and `terminalGeometry` one violation on `8-query-process-2` (two `it.fails`), each listed in its spec.
- Capture: `swimlane-beta` header replaced by `flowchart`, frontmatter `layout` dropped; a conformance spec checks the stored graphs are in sync.

## #596 T0c line hops

## #597 T1 registration
- **Choice (sent to T1 after review):** config layering for `swimlane-beta`, lowest first: flowchart defaults < swimlane defaults < the author's `flowchart.*` < the author's `swimlane.*`. An unscoped directive key goes to `swimlane` when its schema has it, else `flowchart`. D534 says "the swimlane section on top of flowchart's" without the author/default split.
- Default curve needed no code: flowchart's default curve is already `rounded` in v13, and an author's `flowchart.curve` wins.
- `swimlane.theme` now takes effect through the section scope, so it moves to `honoured`.
- **For the maintainer:** T1 costs +325 B gz in core (95,929 → 96,254 on the integration branch at bb9f244e3), against 15–60 B for earlier ports' registration. Most of it is the section layering and schema-keyed directive routing above (core's `KEY_TREE` now exported from `@mermaid-js/core/config`); `typeOptions` (per-type `section`/`layout` in flowchart's manifest, replacing `type === …` branches, also used by `flowchart-elk`) is +28 B.
- Second review fixed: `preload({ types: ['flowchart'] })` loaded ELK (type lookup matched the plugin id); `detect()` returned internal entries; `useWidth` routing and mirroring. Directive keys now route by the swimlane schema, and keys both schemas have are mirrored.
- Note: a third-party replacement of `flowchart` also takes over the `swimlane` row (one plugin id).
- Note for T0b's follow-up: `pebr-2-edge-intrudes-lane-label` takes about 1.8–2.5 s per swimlane layout, so the swimlane corpus spec runs one test per fixture. Worth a stress check on the router.

## #598 T2 lane drawing
- Unlisted timing failures in T2's full `pnpm check` (2026-11-10, under the lock, head 373234444; the load at that run was not recorded): `conformance/src/gantt/stress.spec.ts` "click then blanks" and "a long task text", `conformance/src/treemap/stress.spec.ts` "equal values". Alone at 2 workers, no lock, load average 8.2–10.7: both files pass (3 files, 200 tests). Reported to the wave coordinator for Knut.
- Closed: no lane-only theme row was needed (lanes read `clusterBkg`, `clusterBorder`, `titleColor` and flowchart's `borderColorArray`/`bkgColorArray` palette), so the #589 table question does not arise.
- Closed: T0a's long lane title (`laneFit.ts` `fitLanesToTitles`).
- **Choice:** a lane emptied by a shared node stays, drawn empty (v12 removed it), so every subgraph keeps its `data-ast`.
- **Choice:** `SWIMLANE_SHARED_NODE` lists both lanes in `astIds` (D536 says `related`; render warnings have none).
- Closed in #601 (Knut): no `LayoutModel.lanes`. Lanes are the model's top-level groups (D535): a group whose flowchart subgraph has no parent, or with no subgraph at all (the engine's default lane); the band side comes from `LayoutModel.direction` (D536). "Laid out by swimlane" is the render getting flowchart's lane part (`RenderContext.layoutPart`, below).

## #601 T3 integration
- Closed (R-PERF-1, #651): loaded stand-in (`flowchartClosureSize` on the CDN entry) 132,700 → 131,949 B gz (`mermaid-v13` at 76f2e0ad1: 131,366), core 96,383 → 96,430 B (base 96,052). Growth over the base +583 B (was +1,334); CI ≈ local − 1,180, so about 130,770 B, ~300 B under 128 KB.
  1. Lane drawing and lane warnings are flowchart's lazily loaded part `flowchartLanes` (`@mermaid-js/diagram-flowchart/lanes`; it imports no value from the renderer, only core's shared chunk). The plugin names it per layout (`DiagramPlugin.layoutParts`, `swimlane` → `flowchartLanes`); `mermaid` lists it as a missing `layout` resource of a flowchart render with `swimlane` (so `prepare` loads it with the engine, in parallel), `preload({ types })` loads it with the type's layout, and a render gets its default export as `RenderContext.layoutPart` only when that layout laid it out (engine ready, not text). Per API object, no module state. A class diagram with `layout: swimlane` loads only core's engine. Core +111 B over the earlier module-state version (row, missing check, preload, `layoutPart`), above the ~40 B asked: the "flowcharts only" rule needs the need check and the preload line.
  2. **Choice:** no `SWIMLANE_LANES_NOT_LOADED`: without `LayoutModel.lanes` a render cannot tell lanes from groups unless the part reached it. The one way to lay out with `swimlane` without the part is a placeholder render, whose `PLACEHOLDER` warning names `flowchartLanes`; an engine registered under another name draws plain subgraphs, silently.
  3. **Choice (R-PERF-1):** the parser keeps `FlowModelSubgraph.listed` (every member a subgraph listed, only when an earlier one kept some) instead of `FlowModel.droppedMembers`; the lane part derives the shared-node warning from it (keeper = the subgraph a node is drawn in; same lane = no conflict, which also covers a keeper nested in the lister). −50 B in the parser chunk.
  4. T1's layering trimmed: a chained type resolves every key all its sections' schemas have (`KEY_TREE`, at run time; `theme`, `layout`, `useMaxWidth`, `useWidth` today) into each section; an unscoped directive key goes to `swimlane` when its schema has it (`look` included). **Choice:** the "swimlane defaults over flowchart's plugin defaults" layer is dropped: on every shared key the defaults agree, checked in `swimlanesDiagram.spec.ts`.
  5. **Visible:** `preload({ layouts: ['swimlane'] })` alone no longer lets `renderSync` draw a `flowchart` with `layout: swimlane` (it throws `NotLoadedError` naming `flowchartLanes`); add `'flowchartLanes'`, or preload the `swimlane` type.
- Closed: `swimlane.ignoreCrossLaneEdges`, `optimizeRanksByCrossings`, `automaticLaneOrdering` honoured; `lineHops` already was; `look` stays ignored (D153). `optimizeRanksByCrossings` changes no corpus layout (v12's pass only lowers a node to its longest-path bound, which longest path already gives); `__tests__/optimizeRanksOption.spec.ts` checks the option reaches the pass, only under `ignoreCrossLaneEdges: false`.
- Closed: fixtures `line-hops-{gap,off}`, `automatic-lane-ordering`, `ignore-cross-lane-edges-off`; `3-decisions-tb` is TB; four-family baselines and `hand-drawn.txt` (`sketched`).
- **Choice:** `layout: swimlane` on another type is `e2e/diagrams/class-diagram/pr-check/layout-swimlane-namespaces.mmd`, not under `swimlanes/`: that folder holds `swimlane` only (`FIXTURE_FOLDER_TYPES`, a shared list), and its render and ascii corpus specs are flowchart's. `conformance/src/swimlane/config.spec.ts` renders it.

## #603 T4 ascii
- Closed: `swimlane-beta` ascii draws with `layered`, lanes as plain frames, one `ASCII_DROPPED` (`feature: 'layout'`), no `SWIMLANE_*`; no ascii code needed. `conformance/src/ascii/swimlane-corpus.spec.ts` runs the corpus in both charsets.
- **For the maintainer (visible change for existing documents):** flowchart ascii now blanks the frame border beside a subgroup's *first* title line, not the widest line, so a multi-line subgraph title no longer leaves a gap cut off from the corner (`ascii/draw.ts`). v13-only fix; no snapshot changed.
