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

## #48 (merged) — orchestrator decisions and items for the final review

- Decision: fixture `paddingX`/`paddingY` stay ignored (no config key; our goldens are v13's own output, the upstream check is structural). Not mapped to `padding: 'roomy'`.
- Engine: edges still cross group titles in nested-subgraph corpus cases (e.g. `66/68-more-nested-subgraph-cases`, `┌ thr┴e┼──┐`); 17 corpus renders fail box-to-box. Fix in the final review.
- Engine/drawer: content in a narrow frame sits one cell left (golden `level3`).

## Final review fixes (feature/37_review-fixes) — see tickets/review-fixes.md

- Closed: edges through group titles (engine: title runs keep clear of own top-side ends and a blank
  cell either side; ends step aside, frames grow otherwise) — corpus now checks titles and
  box-to-box; narrow-frame content centred; LR → TB spacing (`LayoutGraph.turnedSpacing`);
  repair.spec wall-clock → `RepairResult.expanded` work bound; corpus layout captured through a
  `postLayout` hook (`layoutCells` gone); columns check independent; CLI precedence/`--format`/docs;
  `ascii-size` gate report-only (D87); direction constants and the `ascii` resolver live once in core/ascii.
- **Maintainer decisions (flag in the PR):** `TextRenderOptions.ascii` (new, additive): explicit
  per-call text options that win over every config source key by key — the CLI flags use it.
  DESIGN §6.3 CLI paragraph and ascii.md say so. Exit 2 is unreachable from the CLI with 13.0's
  built-in types (only the flowchart, which has ascii); documented, not process-tested.
- A title may now sit against its frame's left corner (`┌Nothing here ─┐`) when an edge end steps
  aside to the right; the blank-cell rule only applies between a title and routes.
- Out of scope (not fixed): `LaidOut.layout` is declared `LayoutModel` but the flowchart hands its
  `FlowLayout` (conformance `render.ts` casts it); `units.id === 'cell'` is used as a format flag in
  3 places; `checkText` runs up to 3× per text render path; `(text, s, options, analysis)` data
  clump in api.ts. Other packages still time specs with `Date.now`/`performance.now`
  (`conformance/stress.spec.ts`, `core/preprocess/stress.spec.ts`, `diagram-flowchart/limits.spec.ts`), not #37's.
- Size (mermaid ESM, gzip -9, bench split): SVG-loadable set 102,574 → 103,275 B (+701, the
  grid title/spacing code in the shared engine; M1-close size pass); ascii-only 9,010 → 9,236 B.
