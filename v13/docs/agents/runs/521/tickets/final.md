# Final whole-branch review: handoff

Branch `feature/521_final` (from `feature/521_block` at fac2b7f19, every ticket merged). Choices: GAPS "Final review".

## What changed
- **One composite predicate**, `isComposite` (`model.ts`), read by the layout, SVG renderer, text grid and hover. A composite that a later mention made a leaf (`block:a … end`, then `a(("x"))`) is that leaf everywhere. In text it is drawn as its own box, with its children's grid below it. Tests: `mermaid/src/block.spec.ts` (SVG and ascii through `render()`), `language.spec.ts` (hover).
- **`conformance/src/block/render.spec.ts`** renders through `createMermaid()`: `prepare()` gives the model and AST, `renderSync()` the SVG. The round-trip is read off the model, and the stale comment is fixed. `renderBlockForTest` has left `./testing` (only the package's own renderer spec uses it).
- **`migration/block.md`**: rows for the double circle (natural size, centred) and for nesting 5 or more levels deep (the 16-sizing cap, with the numbers). MIGRATION.md is regenerated.
- **Text path**:
  - the grid uses layout's `gridPosition`/`gridAdvance`, and `tree`/`measure`/`visit` are iterative;
  - `TextBox.directions` replaces `directionsOf`, and `pointing()` reuses `arrowSides` (exported from `shapes/block-arrow.ts`);
  - the router keeps typed-array search bookkeeping on the board, sized to the window. A search stops growing its window once it never meets the window's edge. The forced knee reads ports from the same board. The margin grows past 10 lanes with √edges.
  - New tests: `conformance/src/block/ascii-stress.spec.ts` (6 shapes, MIN_MS/reps, bar 24×, measured 7.7–11.9×); a grid test 3,000 levels deep; `render()` 1,200 levels deep.
- **Public surface**:
  - `./ascii` exports `ascii`, `BlockAsciiContext` and the warning types; `drawBlockText`, `TextBox` and `Route` moved to `./testing`.
  - `src/index.ts` no longer exports `blockPadding`, `blockLabels`, `MAX_SPACE_CELLS`, `MAX_SPAN` or `LeafShape`.
- **Names**: one `Point` (from `shapes/outline.ts`); `BlockDrawing`/`BlockDrawOptions` in `draw.ts`; `M` for the metrics in `route.ts` and `draw.ts`; `Routed {edge, index, route}`; `Board.empty`/`runOf` take over Labels' board checks.
- **Run notes**: the INDEX T7 row; GAPS #640 not needed; T4 `outline.ts` done at T5; the `ascii-size.spec.ts` hand list (rule 1); the `route.ts`/`repair.ts` kernel follow-up.

## Router (one generated shape each, `n` blocks, `n` mixed edges, load 10–16)
| Layout | Blocks | Before | After |
| --- | --- | --- | --- |
| One row | 400 | 2,979 ms, 180 forced | 2,089 ms, 80 forced |
| One row | 800 | 3,992 ms, 677 forced | 3,813 ms, 558 forced |
| `columns 10` | 400 | 2,005 ms, 165 forced | 1,961 ms, 165 forced |
| `columns 10` | 800 | 5,782 ms, 451 forced | 5,134 ms, 451 forced |

On the grid, the margin is not the bottleneck. The 2-line gaps between rows and the ports beside each box fill up first, so dense grids still force edges. Follow-up: gaps that grow with the edges, which needs a D449 amendment.

## Sizes (esbuild, minified, core external, gzip -9; HEAD measured the same way)
Package entry 21,045 → 21,036 B. `./ascii` 7,203 → 7,638 B (+435 B: the iterative grid, the leaf-with-children path and the scratch).

## Unmet
The brief asked for depth 3,000 through `render()`. That drawing is 216 M characters and takes 25 s, so the public test draws 1,200 levels and the grid test covers 3,000. Dense grids still force edges at 400–800 blocks.
