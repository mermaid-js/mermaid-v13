# #291 final whole-branch review: handoff

Branch `feature/291_final-review` (from `feature/291_timeline`). Fixes the ten findings of the final `/code-review`.

## What changed
1. `theme: 'auto'` (`render/paint.ts`): text and rules drawn on a literal palette fill (redux-color's border slot, a `cScale` slot) come from the fill's resolver, the light theme's literal colours, brightened for events; on a live fill (`mainBkg`) they stay live. Flowchart has no such handling (a palette cluster takes live `titleColor` text), so this goes further than it on palette fills.
2. `cScale*` overrides: pinned at the public seam (no change in the four redux themes, the default and `auto`; `default` recolours fill, text and rule; `neo`/`neo-dark` take only `cScaleLabel`). MIGRATION "Timeline config" bullet, the D258 palette row and the `cScale`/`cScaleInv`/`cScaleLabel` schema reasons say so (v12's default theme was `default`).
3. `packages/conformance/src/timeline/render.spec.ts` runs the corpus × 11 themes + `auto` and the AST round-trip through `createMermaid()` (`initialize({ theme, deterministic: true })`, `prepare` + `renderSync`, determinism through a fresh API object's `render()`). `render/testing.fixtures.ts` comment: hand-built models only, no `inline`/`labels`.
4. Sequence puts no `data-ast` on its title, so `TimelineModel.titleAst` is removed (model, parser, parse spec).
5. A blank in-text `title` falls back to the front-matter title; a non-empty in-text title wins (parser; MIGRATION title row).
6. `timelineLabelOffset` description: the `0.5 * padding` form works through `initialize()`/site config, not directives. GAPS item (owner: core) for the sanitizer's silent drop. Spec pins both paths.
7. `layout/env.ts` `lengthOf`: core's config resolution checks no value types, so an invalid set `timeline.leftMargin`, `timeline.padding` or top-level `fontSize` warns `TIMELINE_CONFIG_IGNORED` (with `path`) from the layout via `ctx.warn` and draws the default. `TimelineLayoutContext` takes an optional `warn`.
8. Schema descriptions: `timeline.leftMargin` (was "Margin between actors"), `timeline.padding`, `timeline.disableMulticolor`. `gen:config` run.
9. GAPS: size item updated with new numbers; the duplicated `adjustHue`/`ifSet` browser check merged into the one open item under #338 T4a.
10. Folding end rule pinned in `language-service/src/service.spec.ts` (LF and CRLF, flowchart and timeline); GAPS #318 records it as a shared behaviour change.

## Tests (public seam `packages/mermaid/src/timeline.spec.ts` unless noted)
- `auto`: every box's `[fill, text]` resolved in both schemes (root style + `@media` sheet) is equal in light and dark, and equals plain `redux-color`'s; with emptied palettes the pair switches together.
- `cScale*` per theme family; title precedence (3 cases); `TIMELINE_CONFIG_IGNORED` × 6 through a directive and `initialize`, none for 0 and fractions; `timelineLabelOffset` directive vs `initialize`.

## Size (D161 budget unchanged)
- Bench core closure 89,949 B gz, CDN ESM closure 90,046 B gz (also 90,046 with the base config types; #315's note had 90,050), budget 90,112. No core runtime change.

## Unmet
- GAPS: the `adjustHue`/`ifSet` browser check, the core directive `*` drop (owner: core), the limits/layout chunk split (#315).
