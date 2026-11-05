# Final whole-branch review fixes (spec #295)

Branch `fix/295_final-review` (from `feature/295_icons` at 83a8816c1).

## What changed

1. Changesets `core-icons.md` (`@mermaid-js/core`) and `mermaid-icons.md` (`mermaid`): the icons API.
2. `ICON_UNAVAILABLE` is flowchart's alone. Core (types + 3 lines in `HookRunner.icon`): `glyph()` and `RenderContext.icon` return `SvgFragment | null | undefined`; `null` = unresolved (the extension warns `ICON_NOT_RENDERED`), `undefined` = none (placeholder, declined quietly, or no extension has it). The runner still asks later extensions after a `null`; `null` comes back only when none drew. Flowchart's `iconsNotDrawn` gives the alias for `null` shapes, and for every icon shape when `ctx.icon` is absent. The plugin returns `null` for an unresolved glyph and names no diagram id.
3. Per-render notes: core's `scratch` (one `{}` per render, on `InlineRequest`, `GlyphRequest`, `InlineSpans`; hooks read `ctx.inline.scratch`). The plugin keeps its notes in `scratch.icons`; `notesByRender` is gone. Module WeakMaps left are memoisation (comment in `index.ts`).
4. `mermaid` hands draws `{ names, state, get, error }` (the registry without `load`); resource requests keep `load`.
5. Docs: DESIGN (`icons?(): readonly DiagramIcon[]`, `null` glyphs, `scratch`, the read-only view), icons.md and MIGRATION (the no-plugin warning does not name icons; formless shapes draw nothing; the gradient under `useGradient`), REQUIREMENTS R-API-3. Flowchart's no-plugin text: "…icon shapes draw their frame alone, or nothing without a form."
6. `paints().node.glyph` removed (the glyph uses `node.stroke`); `resources.load` commented; the D296 regex cross-referenced (sharing cost 13 B).

## Tests

`icon-contract.spec.ts`: alias for `null` shapes only, a later extension still asked after `null`, one scratch per render across providers and `postRender`. `icon-packs.spec.ts`: draws get no `load`. `shapes.spec.ts`: alias first, then the plugin's `ICON_NOT_RENDERED`; a placeholder render names only the unresolved shape.

## Sizes (gzip -9)

- CDN ESM closure (`cdn-build.spec.ts`, R-PERF-8, budget 90,112): 89,905 → 89,947 B (+42; 165 left).
- `measureCoreSize` (`core.entry` = `src/cdn.ts`): 89,734 → 89,776 B.

## Byte identity

All 2,368 `e2e/diagrams/**/*.mmd`, svg and ascii, no extension, 83a8816c1 vs this branch: 0 output diffs (1,396 svg + 960 ascii renders; the rest are unported types, same errors). Warnings differ only in 8 flowchart icon-shape files: the no-plugin `ICON_NOT_RENDERED` text.

## Decisions

- `null` from a glyph provider is the "unresolved" signal (no ctx flag): typed, per shape, and placeholders stay `undefined`. With the plugin the alias now precedes `ICON_NOT_RENDERED` (the diagram warns during its draw, the plugin in `postRender`).
- `scratch` is shared by every extension in the render (key by extension id), not per extension: per-extension state would need the runner to map providers to extensions per render (more core bytes).
