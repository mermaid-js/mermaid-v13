# ADR-13: Unit profile

Status: accepted (M2). From D77, refined by D140. R-ARCH-3, R-ARCH-6.

## Context

Layout depends only on the injected measurer (D57), so the ASCII backend was meant to get a
layout in cells by running the same code with a cell measurer. That is not enough. The graph
builder and the `layered` engine use length constants of their own: node and group padding,
label patches, head room, wrap widths, port and track pitches, level margins, snap distances,
the self-loop size, the 640 turn threshold. In px they are a few pixels; read as cells they are
whole screens. The grid-snapping prototype (`research/ascii-snapping.md`, #39) also showed that
snapping a px-tuned layout to cells afterwards breaks the engine's alignment decisions, so the
engine has to lay out in cells itself.

## Decision

Every length constant comes from an injected `UnitProfile` (`@mermaid-js/core/layout`), carried
in `RenderContext.units` next to `measurer`.

- `UnitProfile` has an `id` (`'px' | 'cell'`), `pxPerUnit` (converts px config values),
  `builder` (lengths the graph builder reads), `engine: LayoutMetrics` (the engine's constants)
  and an optional `grid` quantum.
- The builder passes `engine` to the engine as `LayoutGraph.metrics` and the grid as
  `LayoutGraph.grid`. A graph without `metrics` lays out with the px values.
- `pxProfile` holds today's numbers, so introducing it does not change one SVG byte. A unit test
  reads the engine's constants from source and compares them with `pxProfile.engine`.
- `cellProfile('compact' | 'roomy')` holds the cell values (DESIGN §6.3): compact by default;
  roomy gives mermaid-ascii-like spacing. The engine values start from the hand-scaled table in
  `research/ascii-snapping.md` (about px / 8); port pitch is 2 cells, so ends keep a free cell
  between them (D140). They are a first guess, to be tuned by the golden suite.
- `fromPx(profile, value, axis, min)` converts px config values (`nodeSpacing`, `rankSpacing`,
  `wrappingWidth`) at 8 × 16 px per cell, with minimums.
- `units.id` joins the determinism key (R-ARCH-6). The px profile adds nothing to the default id
  prefix hash, so SVG ids stay as they were.

`LayoutMetrics` has two lengths beyond the list in D77: `portSep` (the compound engine's port
spacing, `PORT_SEP` in `layered/index.ts`) and `loopLabel` (the compound self-loop label offset
in `compound.ts`). `builder` also carries the default `spacing`, its `minSpacing` and
`diagramPadding`, since the cell defaults (node 2, rank 4, edge 1, padding 0) are not px config
values divided by 8. Tolerances (`IN_LINE`, `TWIN`) and ratios and counts stay as constants.

## Consequences

- The engine reading `metrics` and honouring `grid` is #42; the flowchart builder taking every
  constant from `ctx.units` is #43. Until then `RenderContext.units` is always `pxProfile`.
- With the px profile the flowchart builder keeps reading the theme's padding tokens;
  `pxProfile.builder.nodePad` records the default theme's values.
- Every other graph diagram (M3+) sizes through `ctx.units` from the start, so it gets ASCII
  layout without its own constants.
