# GAPS — spec #37

Unmet acceptance criteria and announced shared contracts, grouped by the ticket that owns them.

## Contracts and ownership (set by the orchestrator, from 01-explore.md open questions)

- **Manifest `ascii` key:** #46 adds `"formats": ["svg","ascii"]`, `"ascii": "./dist/ascii.js"` and the `./ascii` exports entry in diagram-flowchart's package.json. #47 extends `DiagramManifest`/`readManifest` (core/src/pipeline/manifest.ts) and the registry codegen with a second lazy import for the ascii entry, and wires `api.ts` (`ctx.units` is currently hard-coded to `pxProfile` at api.ts:539).
- **Warning codes:** #46 defines `ASCII_DROPPED { feature, astIds }` and `ASCII_SHAPE`; #47 defines `ASCII_TOO_WIDE`. Add them wherever the existing warning-code union lives, additively.
- **Entry location:** the flowchart ascii hook lives at `packages/diagram-flowchart/src/ascii.ts` or `src/ascii/` (import-boundaries rule only allows `ascii`-named paths to import `@mermaid-js/core/ascii`).
- **Junction merging** is `junction()` in core/ascii `glyphs.ts`; there is no separate junction module.

## #43 (merged)

- Open for #46/#47: in cells `diagramPadding` converts on x only; cell label widths are not rounded and rely on `cellMeasurer` returning whole cells.
- px node pads still come from theme tokens (byte identity); `builder.nodePad` is used only for cells.

## #42

- Grid-mode model contract: coordinates are cell indices (doc on `LayoutGraph.grid`); `validateGrid` in core/layout checks it.
- Open for #43/#46: the builder does not pre-size boxes from edge ends per side (D140); the engine grows 97 of 494 corpus graphs.
- Open for #45: sibling/unrelated edges sharing track cells, runs along group frames (padding 1), corner touches, group-to-member routes.

## #45

- **Scope vs the ticket text: widened slightly, not narrowed.** As written, plus (from #39 and the
  ticket comment) corner touches, group titles as walls, and every edge end cell reserved for its
  edge. Back edges are not special-cased: like every edge, only their colliding stretch is
  re-routed, so the rest keeps its layout shape. Self-loops are never re-routed (collisions reported).
- Name: `repairRoutes(graph, model)` works on the whole model (model order, D78/R-ARCH-6), not one route.
- Siblings are never merged (D140). When no lane exists the snapped stretch is kept and listed in
  `RepairResult.unresolved` (kind `shared`); turning that into a warning is #46's.
- Open for #46: group titles. Repair takes a title's cells as `round(x − w/2 + ½) …` (half-cell
  centres round right). 6 of 494 corpus graphs (and perf `medium3`) keep a route through a title
  on the frame: the engine puts ports under the title with padding 1. #46 must draw titles at the
  same cells; a builder/engine fix would let ports avoid the title band.
- Open for #48: the corpus property lives in `flowchart-grid.spec.ts` (no box or edge-label hit
  after repair); titles are left out of it.

## #42 (merged)

- **Size (for the M1-close size pass, not for ticket work):** grid code lives in the shared layered engine, so the SVG flowchart bundle grew 92,039 → 94,102 B gz. R-PERF-1 is 80 KB; the maintainer's tolerance was +10–15%. Maintainer decision pending.
- **#45 owns:** cells shared by sibling/unrelated edges, runs along group frames, corner touches, group→own-member routes (split in tickets/42.md). Use `validateGrid` from `@mermaid-js/core/layout`.
- **#46 owns:** keeping a grown box's label centred (the engine grows boxes in place, D140; 97/494 corpus graphs).
- Open: the builder does not pre-size boxes from per-side edge ends (D140). `IN_LINE`/`TWIN` stay px-sized (not in `LayoutMetrics`).

## #45 review round (merged, b5b1e1d86)

- Review-6 spec in `core/ascii/repair.spec.ts` asserts a wall-clock bound (< 800 ms). Timing specs break determinism (spec: no wall-clock time). Final code-review should replace it with a work-count assertion or move it to bench.
- Engine: edge end cells can land on a group title (2 F3 fixtures, 5/200 random). Sent back to #42; the F3 cases are pinned in repair.spec.ts until then.

## #46

- Closed: grown-box label centring (drawer centres in the model's box); titles drawn at
  `round(x − w/2 + ½)`; `unresolved` → one `ASCII_ROUTE` warning; manifest + `ASCII_DROPPED`/`ASCII_SHAPE`.
- **#47 owns:** `toWarning` in api.ts must keep `feature`/`shapes`/`astIds`; pass `title` and `ast`
  in the hook context; api.spec ascii test flips to rendering.
- Engine (#42): group frames sit one cell off their content (right padding 0 beside a node in LR
  groups, `┌───┐│`). Seen in tickets/46.md examples.

## #47 (merged) — for the final review

- Width fitting: when `maxWidth` turns LR → TB, rank spacing keeps its x-axis cell value (5 rows between ranks vs 2 for native TB). Recompute spacing for the turned direction.
- `LaidOut` declares `LayoutModel` but the flowchart's postLayout value is `FlowLayout` (pre-existing type mismatch, surfaced by #47).
- Text output ignores px `options.availableWidth`; only `ascii.maxWidth` counts (documented in tickets/47.md).
- SVG path +562 B gz for the lazy ascii loader (size pass at M1 close).

## #48

- Closed: the #45 corpus property moved to `conformance/src/ascii/corpus.spec.ts` (both charsets, e2e + v12 specs).
- Open (not a D87 property): edges connected box to box fails on 17 corpus renders, mostly an edge through
  a group title (`66/68-more-nested-subgraph-cases`); see tickets/48.md.
- `paddingX`/`paddingY` in fixture meta have no config home; ignored. Decide if `roomy` should map.
