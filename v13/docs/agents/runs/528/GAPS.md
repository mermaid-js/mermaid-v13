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
- Closed: no lane-only theme row was needed (lanes read `clusterBkg`, `clusterBorder`, `titleColor` and flowchart's `borderColorArray`/`bkgColorArray` palette), so the #589 table question does not arise.
- Closed: T0a's long lane title (`laneFit.ts` `fitLanesToTitles`).
- **Choice:** a lane emptied by a shared node stays, drawn empty (v12 removed it), so every subgraph keeps its `data-ast`.
- **Choice:** `SWIMLANE_SHARED_NODE` lists both lanes in `astIds` (D536 says `related`; render warnings have none).
- **Choice:** lanes are drawn when `config.layout` is `swimlane`; a placeholder stand-in render draws them too.

## #601 T3 integration
- From T1: `e2e/diagrams/swimlanes/hand-drawn.txt` and the four-family visual baselines; the other `swimlane.*` statuses.

## #603 T4 ascii
