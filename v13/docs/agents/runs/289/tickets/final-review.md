# Final review fixes (branch `feature/289_final-review-fixes`, on `ff73f5f17`)

Four findings of the whole-branch review, each confirmed through `createMermaid().render()`.

## What changed

- **Prototype style keys** (`parser/styles.ts`): the key table is a `Map`, so `constructor`,
  `toString`, `valueOf`, `hasOwnProperty` are one `QUADRANT_STYLE_UNKNOWN` each (render:
  `SYNTAX`; service: no `LANGUAGE_FACET_FAILED`). `__proto__` is `UNEXPECTED`: `_` is not in a
  style key's alphabet (v12's lexer).
- **Config types** (`src/config.ts`, `quadrantLayoutConfig(section, warn)`, used by
  `plugin.ts`): the 16 lengths are read as sequence/ER `configNumber()` (copied, not imported):
  a finite number >= 0 or a numeric string; else the schema default and one
  `QUADRANT_CONFIG_INVALID` per key. `xAxisPosition`/`yAxisPosition` fall back the same way.
- **Multi-line growth** (`render/render.ts` `lifts()`; layout adds `QuadrantAxisLabel.side`):
  a label above or left of the square is drawn back by `height - lineHeight`, so its last line
  sits on v12's anchor; the title also moves up by a top x axis's extra lines. Bounds follow.
  One line: lift 0, byte-identical output (parity, render and baseline specs unchanged).
- **MIGRATION:** D225 row (`<b>`/`<i>`, other tags dropped with text kept, raw newline in
  quotes, outward growth); config value types bullet.

## Tests

- `diagram-quadrant`: `parse.spec.ts` (prototype keys), `recovery.spec.ts` (one case, 4 lines).
- `conformance/src/quadrant/render-features.spec.ts`: prototype keys -> `SYNTAX`; config
  numeric strings, invalid values, sides; 2- and 3-line title, top x axis (with title), left
  y axis: last line on v12's anchor, no overlap with the square or the title, viewBox covers;
  raw newline; bottom/right unchanged.
- `service-symbols.spec.ts`: no `LANGUAGE_FACET_FAILED` over the gate corpus; prototype keys.
- `corpus/quadrant-cases.json`: `style-prototype-keys`, `classdef-prototype-keys`.

## Size

- `diagram-quadrant` entry, esbuild minified, core external: 13,204 -> 13,760 B gz.

## Unmet

- None of the four. Timing: not measured on a steady machine.
