# ADR-14: Text output

Status: accepted (M2). From D76, D78, refined by D79–D87 and D140. R-ASCII-1, -4, -5, -9.
Builds on ADR-13 (unit profile). User docs: [ascii.md](../ascii.md).

## Context

v13 adds ASCII/Unicode text output beside SVG (`format: 'ascii'`, DESIGN §6.3). D24 planned to
run the shared layout with a monospace measurer and snap its orthogonal routes to the character
grid. Three questions had to be settled before building it:

1. **Who draws, and where does the code live?** mermaid-ascii (the Go tool the goldens come from)
   has its own parser, layout and router per diagram. A separate `packages/ascii` would keep text
   out of the plugins but would have to understand every diagram model.
2. **How do routes become cells?** The #39 prototype (`research/ascii-snapping.md`) showed that
   snapping a px layout after the fact breaks the engine's alignment, that a one-line LR box has
   one usable cell per side, and that snapped routes collide (through boxes, labels, frames, and
   each other). mermaid-ascii's router lets edges overlap by design and ignores subgraph frames.
3. **What does it cost the SVG path?** R-PERF-1 (80 KB gzip for core + flowchart) leaves no room
   for a second backend in the SVG bundle.

## Decision

**Diagrams draw their own text; core supplies a kit.** Each diagram that supports text has an
`ascii` hook, `ascii(model, layout, ctx) → { text, columns, rows, warnings }`, reading its own
model and the `LayoutModel` just as `render` does for SVG (D76). It lives in a separate entry
(`@mermaid-js/diagram-flowchart/ascii`) that the manifest names under `ascii` and that the
generated registry loads lazily (`loadAscii`). `formats` in the manifest declares support;
`supportsFormat` reads it, and an unsupported type throws `UnsupportedFormatError`, never an
approximation (D58). `LayoutModel` stays pure geometry: no labels, shapes or strokes are added.

The shared **text-grid kit** is the `@mermaid-js/core/ascii` subpath: canvas, glyph sets
(`unicode`, `ascii`), junction merging (`junction`, one arm-by-arm lookup for every line weight,
D79), cell text and the cell measurer (grapheme clusters, East Asian width, D81), `snapRoute` and
the repair router. The drawing code is ported from mermaid-ascii (MIT); its parser and router
are not. The `mermaid/import-boundaries` lint rule lets only `ascii`-named modules import the
kit, so SVG code cannot reach it.

**One layout, in cells.** The pipeline runs the normal parse and layout with the cell measurer
and the cell `UnitProfile` (ADR-13). The profile's integer grid quantum (`LayoutGraph.grid: 1`)
turns on `routing: 'stepped'`, so boxes, ports and tracks land on whole cells (D78). Every edge
end gets its own cell on a box side; a side with too many ends grows the box, never bundles them
(D140). The hook then snaps each route to cells and runs `repairRoutes`: a cell-space A\* with a
turn penalty that re-routes only the stretches that collide after snapping (box, label, group
frame or title, another edge). Siblings are never merged. A stretch with no free lane is kept and
reported as one `ASCII_ROUTE` warning.

**Pipeline and API.** `render` / `renderSync` with `{ format: 'ascii' }` return
`TextRenderResult` (overloads keep SVG callers on `RenderResult`, D80). `prepare` loads the text
entry; text needs no theme. `postParse` and `postLayout` run as for SVG and see
`LaidOut.units: 'cell'`; `postRender` and `afterMount` do not run; the DOM adapter stays SVG-only
(D86). Config is the `ascii` section (`charset`, `padding`, `maxWidth`) with no schema defaults,
so SVG ids do not change (D77, D79, D84). Features with no text form are dropped with one warning
per kind (`ASCII_DROPPED`, `ASCII_SHAPE`, D82). A `mermaid` CLI renders either format (D85).

**Budget.** The text chunks are outside R-PERF-1 and have their own 15 KB gzip budget (D87). The
bench's `ascii-size` gate measures the chunks of the production bundle that only an ascii entry
reaches; `packages/bench/src/ascii-size.spec.ts` checks the same in `pnpm test` and that the SVG
path (entry, its lazy chunks other than ascii entries) contains no ascii module. The type ×
format matrix (`format-matrix.md`) is generated from the manifests by `pnpm gen:registry` and a
spec fails when it is stale.

## Consequences

- A graph diagram ported in M3+ gets text layout for free (its builder sizes through
  `ctx.units`); it still writes its own `ascii` hook for shapes and strokes, using the kit.
- Text output places things differently from mermaid-ascii, so its goldens are checked
  structurally and v13 keeps its own reviewed goldens (D83).
- The layered engine carries grid-mode code that SVG renders also download (about 2 KB gzip on
  the SVG path, #42), plus the lazy ascii loader (about 0.6 KB, #47). The text kit itself is never
  on the SVG path.
- Repair is local: when the engine leaves no lane, edges may share cells (`ASCII_ROUTE`). Better
  port placement in the engine, not a bigger router, is the fix.
- Cell-native layouts (D24's "later") stay possible: a diagram may return a cell `LayoutModel`
  from its own algorithm and reuse the same hook and kit.
