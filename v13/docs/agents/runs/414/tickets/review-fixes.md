# Final review fixes (#414)

Branch `feature/414_review-fixes`, cut from `feature/414_theme-t0` (`251696073`). One commit per item; choices in GAPS.md "Review fixes".

## What changed

1. `29a3ca1c3` **`inline()` reads only what the theme wrote** (`core/theme/theme.ts` `written()`): never the author's override of v; `inline(v, b)`'s "set" drops the author arm. Tests: core `diagram.spec.ts`, `theme-palettes.spec.ts` (an author `scaleLabelColor` leaves sequence's actor, label and loop text as the theme draws them, `cScaleLabel` still v12's), sequence `table.spec.ts` (`actorTextColor` override wins). CONTRACT.md, `dsl.ts`, DESIGN §8.1.
2. `eae0b9d82` **D337 edge case**: the fragment-rule skip ignores a table var that shadows a core name. Test in `diagram.spec.ts`.
3. `4d1cda2d1` **Direction rule 1** scans object keys, shorthand properties and property accesses (comments allowed); planted cases for each. `unreadInputs`: every `D332_INPUTS` entry but `plotColorArray` is read by a table rule. Header notes rule 2's indirection limit.
4. `c6558d471` **Series fallback** (`BASE_SERIES`, v12 theme-base's pie and journey derivation) in the slot read. The twelfth-theme check requires a real colour for every colour row but the author-only and some-themes rows; planted case (`cScale2`, `bkgColorArray0` fail, series slots pass). The themed stub reads `seriesColorArray2`.
5. `6037f46d4` **D333(a)**: default `pie3` `#b9ff20`, `pie6` `#d9ff86`; forest `pie6` `#33b52e`; redux-dark and neo-dark `pie5` `#2e2f2f`. Pie oracle `DIFFERENCES` (each checked to differ from v12 and to equal its rule), neo-dark `DIFFERENCES` `pie5`, MIGRATION.md rows (Pie chart, neo-dark), `theme-variables.md` regenerated.
6. `96ade5e68` **Cleanups**: JSDoc on `THEME_VARIABLES` and each `export const theme`, D331 cited; gitGraph D153 → D152; core exports `PALETTE_SLOT` and `THEME_FAMILIES` (`ThemeFamily` derives from it), reused by theme-direction; `table-name-collision`, `table-writes-foreign`; theme-used-by reuses `PACKAGES`; theme-direction and theme-packages exports documented; pie's 138-column comment (and journey's, quadrant's) wrapped.

## Identity (against `base-488a4bf.json`)

134,352 renders, **0 differing, 400 allowed**: item 5's pie renders, each in the four variants (plain, darkMode, literal, overrides). Under `e2e/diagrams/pie/`:

- In all twelve theme runs (the fixture sets its own theme): `baseline/themes/{default,forest,neo-dark,redux-dark}.mmd`, `nightly-check/{default,redux-dark}-theme.mmd`.
- In `default`, `forest`, `neo-dark` and `redux-dark`: `baseline/data/many-slices.mmd`, `pr-check/should-render-a-pie-diagram-with-a-long-title-without-clipping.mmd`.
- In `default` only (three to five slices): `baseline/config/{donut-and-text-position,highlight-slice}.mmd`, `baseline/data/show-data-and-tiny-slices.mmd`, `baseline/legend/{bottom,center,left,top}.mmd`, `baseline/text/{line-breaks-and-unicode,markdown-and-tall-labels}.mmd`, `nightly-check/{highlights-hovered-slice,highlights-specific-slice,should-render-a-pie-diagram-with-legend-at-the-bottom-of-the-diagram,should-render-pie-slices-only-for-non-zero-values-but-shows-all-legends,should-render-usemaxwidth-false}.mmd`, `pr-check/{should-render-a-donut-diagram,should-render-a-pie-diagram-if-donuthole-parameter-is-negative,should-render-a-pie-diagram-if-donuthole-parameter-is-too-large,should-render-a-simple-pie-diagram-with-capital-letters-for-labels,should-render-a-simple-pie-diagram,simple-sports}.mmd`.

The SVG diffs are only those slots' fills (literal) or their `--_pi<n>` declarations (CSS, now a rule over `--_t`/`--_s`). Items 1–4 and 6 changed no render.

## Core size (gzip bytes)

| Measure | `251696073` re-measured | This branch |
| --- | ---: | ---: |
| Bench (`core-size.spec.ts`) | 91,563 | **91,715** (+152, `BASE_SERIES`) |
| CDN (`cdn-build.spec.ts`) | 91,980 | **92,124** |

Budget 94,208 B (D338): 2,493 B headroom (bench), 2,084 B (CDN).

## Checks

- `pnpm check`: lint, knip, typecheck, deps, licenses, config and grammar pass; tests 14,223 passed, 2 failed: `gantt/schedule-stress.spec.ts` "drawn exclude ranges" (known, fails at the base) and `language-service/src/review.spec.ts` "semantic tokens never overlap" (a 5 s timeout under load; 26/26 pass rerun alone).
- `pnpm e2e`: 2,170 passed.
- `pnpm gen:theme`, `pnpm gen:config`: regenerated; only `theme-variables.md` changed (item 5's five values).

## Unmet

- None.
