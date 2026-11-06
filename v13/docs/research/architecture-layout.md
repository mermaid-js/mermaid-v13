# Architecture layout: own constraint engine or Pele's grid

<!-- cspell:ignore mulberry snet -->

M5 inventory §2 (architecture row), §4 risk 2, §6 Q5. v12 lays architecture out with cytoscape and fcose. R-PERF-2 rules fcose out as a dependency.

## Question

Which base do we use for architecture layout in v13?

- **A.** Our own constraint layout at `core/layout/force`, loaded lazily like `tree` (D280): side constraints `L/R/T/B`, groups as compounds, alignment, determinism.
- **B.** Pele's approach (`src/diagrams/architecture/layout.ts`, pele@1.13.0, MIT), ported with attribution as D66 / O-7 did for `layered`.

v12 paths are under `packages/mermaid/src/diagrams/architecture/` at `mermaid@12.2.0`. Pele paths are relative to `/Users/knsv/repos/pele` at `3a2f075`.

## v12 (fcose) behaviour

- **Graph.** Services and junctions are cytoscape nodes of `iconSize` square. Groups are compound parents (`architectureRenderer.ts:48-110`).
- **Spatial map.** A BFS per connected component gives each node an integer cell from its edge sides (`architectureDb.ts:293-385`, `architectureTypes.ts:133-152`). Edges between groups record a group alignment; bends record none (`architectureDb.ts:306-313`).
- **Alignment constraints.** Nodes sharing a spatial-map row or column are aligned, except across groups not joined on that axis (#5952, `architectureRenderer.ts:155-259`). Heuristic groups touching an `align row|column` hint are dropped and the hints appended (`:261-283`).
- **Relative placement constraints.** Hint chains, plus one constraint per adjacent grid pair, each with gap `idealEdgeLengthMultiplier × iconSize` (`:291-373`).
- **Options** (`:477-510`): `quality: 'proof'`; `randomize`, `nodeSeparation`, `numIter` from config. Edge length 1.5 × `iconSize` in a group, 0.5 × across groups; elasticity 0.45 versus 0.001 (fcose#67 workaround). Labels play no part (`nodeDimensionsIncludeLabels: false`).
- **Runs twice.** `layoutstop` sets bend weights and calls `layout.run()` again (`:513-581`). Unsatisfiable constraints throw `RangeError`, rewrapped at `:582-601`.
- **Determinism.** Only by swapping the global `Math.random` for mulberry32 during each run (`architectureSeed.ts:13-31`); `seed` defaults to 1, `0` opts out (`src/schemas/config.schema.yaml:1159-1204`). Six of the ten config keys are fcose knobs.
- **Edges.** Straight, or one bend through cytoscape's midpoint (`svgDraw.ts:94-97`). `{group}` only moves the drawn end by `padding + 4` (`svgDraw.ts:54-71`). A group id as an edge end throws `TypeError` (`architectureDb.ts:225`).

## Pele's approach

- **Algorithm.** Discrete grid placement, no force step (`layout.ts:4-8`). `a:R -- L:b` puts b in the next cell right; a bend steps one cell along the leaving side and one back from the entering side (`:207-211`); like sides stack across (`:203-206`).
- **Containers.** Each group, innermost first, then the root, is laid out alone by BFS (`:258-346`). A link is lifted to the two children of the lowest common container (`:65-99`). A finished group is a rigid block of cells.
- **Conflicts.** Hints go before edges (`:271-281`), like-side edges last (`:108-116`). A taken cell slides the node to the nearer free side (`:242-249`); fan-in lines up with the median (`:221-240`). Disconnected parts pack into near-square rows (`:294-339`).
- **Pixels** (`render.ts`). Empty rows and columns compact away (`:27-32`); sizes come from measured boxes and edge labels (`:245-302`); group insets (`:304-380`); orthogonal routes (`:106-152`). `{group}` ports sit on the real border (`:399-408`).
- **Config.** Only `iconSize` (48), `fontSize`, `padding` (20) (`render.ts:215-217`). fcose-knob specs are skipped (`tests/compat/architecture/SKIPPED.md`).
- **Size.** `layout.ts` is 379 lines, 2.1 KB gzip, pure and synchronous, no dependencies, no randomness.

## Measurements

A throwaway Node harness ran the 20 `e2e/diagrams/architecture/*.mmd` files. Pele was bundled from source with esbuild and rendered twice. fcose is v12's constraint code ported line for line onto headless cytoscape 3.34.4 + fcose 2.2.0, with v12 defaults and each file's config, fed by Pele's parser (same `populateDb` order, `db.ts:137-147`). No label styles (they need a canvas); group boxes are children plus `padding`.

| Check | Pele | v12 fcose |
| --- | --- | --- |
| Renders without error | 20/20 | 20/20 |
| Identical across two runs | 20/20 (SVG bytes) | 20/20 with `seed: 1`; 4/20 differed with `seed: 0` |
| Node overlaps | 0 | 0 |
| Node inside a foreign group | 0 | 0 |
| Facing edges (`R–L`, `T–B`) on the right side and aligned | 79/87 | 77/87 |
| Bends in the expected quadrant | 10/10 | 10/10 |
| `align` pairs honoured | 11/11 | 11/11 |
| Same left/right and above/below order per node pair | 327/411 overall; 279/279 in 18 files | |
| Time, indicative (busy machine) | 0.04–3.3 ms full render | 1.8–59 ms layout only |
| Minified gzip | 2.1 KB | ~141 KB cytoscape + ~35 KB fcose stack |

## Where they differ on the corpus

1. **Deep nesting.** Only the two 12-node, 8-group fixtures differ in order (27/66 and 21/66 pairs agree). Each breaks 2 of 9 facing edges, not the same ones: fcose `web:R--L:pe1`, `pe2:R--L:bus`; Pele `web:B--T:pe2`, `pe2:R--L:bus`. Cause: `snet2` is a rigid block placed by its first link from `snet1`, so the second link cannot hold.
2. **Fan-in.** Where three services feed one node, v12 aligns 0/3 (the hint drops heuristic alignments, `architectureRenderer.ts:261-270`); Pele aligns the median, 1/3.
3. **Scale.** fcose springs (120 px in a group, 40 px across) against Pele's cell gap `max(40, 0.75 × iconSize)` and smaller defaults. A three-node chain spans 5 icon widths in fcose, 2 cells in Pele.
4. **Knobs.** Four fixtures exist to exercise one. Pele renders `randomize: true` byte-identical to its baseline, and `idealEdgeLengthMultiplier: 3` byte-identical to the default chain.
5. **Edges.** v12 straight or one bend; Pele orthogonal with rounded corners.

Not honoured by Pele: the six fcose knobs, shorter edges across groups, and groups that deform to satisfy several links. The #5952 rule holds in Pele by construction.

## Comparison

| | A: own `force` engine | B: port Pele's grid |
| --- | --- | --- |
| Fidelity to v12 semantics | Can target every fcose constraint and flexible groups; pixels still differ without fcose's spectral and spring passes | Matches order on 18/20 files; rigid groups lose some cross-group links; six knobs dropped |
| Determinism | Must be designed in | By construction |
| Size | Unknown; a compound constraint solver is large | 2.1 KB gzip plus ~300 lines from `render.ts` |
| Effort | High: new numeric solver, tuned on DDLT fixtures | Low to medium, about the `tree` engine (D280) |
| Risk | Convergence and conflicting constraints, v12's `RangeError` class | Rigid-block limit on nested diagrams; visual change under P2 |

**Fit with v13.** `placeOnGrid` returns cells, not a `LayoutModel`. To be a plain `LayoutEngine` (DESIGN §6.1) it needs optional per-end sides and a group-border flag on `LayoutEdge`, an optional `align` list on `LayoutGraph`, and the cell-to-px pass and router moved into the engine. `LayoutModelEdge.ports` already exists (`packages/core/src/layout/types.ts:174`). `direction` and `spacing.rank` would be ignored. A diagram-owned layout type also works but loses DDLT fixtures and shared validators. A text-grid path looks cheap since the output is a grid (inference, not tried).

B can be the starting point for A: it already solves A's constraint list deterministically, and a refinement pass for flexible groups can come later behind the same contract.

## Recommendation (maintainer's choice open)

Take B as the base of A. Port `placeOnGrid` and the pixel pass into a lazily loaded core engine (D280 precedent), with MIT attribution (D66) and v12 defaults (`iconSize` 80, `padding` 40, as O-7 change 1). Add the `LayoutGraph` fields above. Mark the six knobs `ignored` with MIGRATION.md rows. Track rigid groups as a known gap with DDLT fixtures.

Choices: **(a)** B as is; **(b)** B plus a fix for several links between two blocks; **(c)** A from scratch, paying size and effort for flexible groups.

## Open questions

1. Name and subpath: `force` describes A; B is a grid (`grid`, `constraint`).
2. Map `idealEdgeLengthMultiplier` to the cell gap and `nodeSeparation` to `spacing.node`, or ignore all six knobs?
3. Side and `align` fields in the shared `LayoutGraph`, or a custom architecture layout?
4. Do the nested fixtures need (b) before M5 closes?
5. `architectureTypes.ts:141` puts b above a for `a:R -- T:b`, yet fcose placed all 10 corpus bends in the expected quadrant. Diagonal cells only feed alignments: a latent v12 bug on larger diagrams? Not verified.
6. An edge to a group id: Pele's semantic error (`db.ts:110-113`) instead of v12's `TypeError`?
