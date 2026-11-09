# Final whole-branch review (spec #429): fixes

Branch `feature/429_venn-final-review` (base `feature/429_venn` efc8e6f20). Choices are in `GAPS.md` (#491, #495, #498, marked "final review").

## What changed
1. `gen-config/generate.ts`: `sectionDefaults` moved below `sectionKeys`, each with its own JSDoc.
2. The venn bench (`cli/language-venn.ts`, `language-budget-venn.spec.ts`) loads the facet from the registry (`createLanguageService()` + `preload`, as cynefin's); the eager row is gone, the gate is unchanged. Stale #501 comments fixed in `index.ts`, `render/harness.ts`, `test-context.ts`; `conformance/src/venn/render.spec.ts` stays on the plugin seam and says why (it reads the layout, which the public API does not return).
3. Core `vocabulary.ts`: venn joins the `fontFamily` comment (comment only).
4. One `idsKey` (`JSON.stringify`) and one `nullRecord` in `model.ts`, used by the warnings, solver, layout, invariants and hover (`areaKey`, `keyOf` and the inline key are gone).
5. One `pairwiseRule` in `model.ts` (v12's `ensurePairwiseSubsets`): the layout takes `added()`, the warnings `covers()` (no pair listing, so the wide-union stress stays linear).
6. The layout carries each area's and text node's merged `style`; `vennPaints(ctx)` paints from it (one check per merged style) and no longer reaches into `layout/metrics.ts` or the solver.
7. `VennAreaLayout = VennSetLayout | VennOverlapLayout` on `kind` (`circle`, `index`, `slot` required on the set arm, `never` on the other); no `?? 0` fallbacks, and the invariants' "set has no circle" check is gone (the type has it); "is a set" tests use `kind` or the one `setIdOf` helper.
8. Renames: warnings `Placed` → `Sourced`; render `Placed` → `Outlined`, `Drawn` → `PaintedArea`; geometry `Drawn` → `LayoutDrawing`, `union` → `boxUnion`; solver `venn()` → `fitCircles()`.
9. `VENN_ZERO_SET` writes ids with `idText` / `listOf` (`` sets `"a b"` and `C` ``); new expectation in `mermaid/src/venn.spec.ts`.
10. Root exports `areaKey`, `vennStyles`, `VENN_METRICS`, `VENN_SLOTS`, `vennLayoutConfig` removed (no consumer); `renderVenn` kept, as cynefin and kanban export `renderCynefin` / `renderKanban`.
11. `VENN_SLOTS` (and `slotOf`) live in `theme/slots.ts`; the layout imports it from there. The vocabulary's slot rows and `theme-used-by.spec.ts` derive the count from it; `gen:theme` output unchanged.
12. One test-context builder (`test-context.ts`: `vennTestConfig`, `vennTestTheme`, `vennRenderContext`), which the harness uses. Spec results unchanged; two inputs differ: the layout specs now lay out in the default theme's font family (redux-color, was `default`'s; only `tableMeasurer` widths move, every invariant and parity holds), and `parsedVenn` honours `init` directives (`highlighting/comments-and-directives.mmd`'s `padding: 10`), as a render does.
13. Label ink under `auto`: core has no way (GAPS #495, For the maintainer); nothing changed.
14. Numeric-string config values: v12 coerces them only through its arithmetic; kept as a Choice (GAPS #491).
15. Long comment lines wrapped (`language.ts`, `core-chunks.spec.ts`); fmin's positional params recorded (GAPS #491).

## Sizes (gzip -9) and checks
- Package (esbuild, minified, core external): entry 19,987 → 20,044 B, `./language` 12,328 → 12,434 B (the shared `model.ts` helpers).
- Core: bench `measureCoreSize` 93,747 B before and after (core changed by a comment only); CDN ESM closure 94,132 → 94,132–94,135 B (limit 94,208): its code is byte-identical to the base; only the content-hashed name of the shared chunk moves (the vocabulary comment reaches it through the source map), and the gzip of the entry moves with that name by up to 3 B.
- `pnpm check` green (776 files, 16,806 tests; `VITEST_MAX_WORKERS=4`, under the lock). `pnpm e2e` 2,423 passed, 0 failed. `language:venn --runs 100 --warmup 20` (registry-loaded facet, load 2.8, not a steady machine): cycle 13.17 ms (best 12.65), bare parse 2.41 ms, within 15 ms.
