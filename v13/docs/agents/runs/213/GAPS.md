# Gaps — spec #213

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Contracts

- **Gradient vocabulary (owner #223).** #223 adds `useGradient`, `gradientStart`, `gradientStop` to `vocabulary.ts`, the schema and every shipped spec (off). #225 and #227 do not define them; once #223 is merged, the neo specs set `useGradient: true`, `gradientStart #0042eb`, `gradientStop #eb0042` (whichever of #225/#227 merges after #223 does it, or the coordinator).
- **`theme.outline(name)` (owner #223).** T3–T7 call it where v12 neo strokes with the gradient; nothing else.

## #223 T0 core gradient

- [x] Merged (PR #258) with the neo gradient turned on. Default path +1,348 B gz; reported in #248 for the size-budget spec.
- [x] Browser test (e) ran in local Chromium; it runs again in the Playwright image at the close (#236).
- [ ] Follow-up, not this spec: `styleScope` maps an invalid idPrefix to `p-<hash>`, which a valid prefix can equal, so two renders can share a gradient id (and `data-p`). Pre-existing.
- [ ] Known limit: under `theme: 'auto'` the gradient stops take the light theme's values (pairing auto with neo is out of scope, #213).
- Stream and tree backings agree; a postRender hook can point a fill/stroke at the SVG's own gradient only (D182 allows it).

## #225 T1 neo

- [x] Merged (PR #253). Size: default path +12 B gz (name and loader in `registry.ts`); the spec is its own 451 B gz chunk. Accepted as the cost of registering a theme; reported in #248.
- [x] Gradient values in `neo.ts` (integration merge of #223).

## #227 T2 neo-dark

- [x] Merged (PR #259). Gradient values in `neo-dark.ts` (integration merge).
- [x] `altBackground #f0f0f0` kept from v12 (D126) on a dark theme; not a text pair. #234 judged it: it reads badly. Now `#404040` (D189, #236).

## #229 T3 flowchart

- [x] Merged (PR #261). Carries a8669b5f4 from #257 (cherry-picked): the new fixtures move the grammar sampler onto `A@{…}@{…}`.
- [x] Decided 2026-11-05 (D184, D185, D186; MIGRATION.md "Neo gradient", #236): linked nodes get the gradient (v12 bug drew them plain); `lin-doc` rule and `fr-circ` dot in plain nodeBorder; icon frames take the gradient until the icons plugin.

## #231 T4 sequence

- [x] Merged (PR #260). No gradient, as in v12 (evidence in tickets/231.md). Text size follows the theme (D132).
- [x] Decided 2026-11-05 (D184; MIGRATION.md drop shadow row, #236): participant boxes take the theme shadow; v12's white offset filter did not show.
- [ ] Still open (tickets/231.md, not in the 2026-11-05 answers): sequence text at the theme's 14px under the redux family, `neo` and `neo-dark`, v12 16px; proposed MIGRATION.md addition there.
- [x] For #236: MIGRATION.md's "Not in 13.0" gradient row now says what v13 does (D182).

## #233 T5 class

- [x] Decided 2026-11-05 (D187; MIGRATION.md Class diagram SVG structure, #236): `style`/`classDef` fill and stroke on a class box take effect in every theme.

## #234 T6 state

- [x] Decided 2026-11-05 (D185, D188, D189; MIGRATION.md State diagram SVG structure and neo-dark, #236): region divider plain under the gradient; choice shadow (pre-existing); neo-dark `altBackground` `#404040`.

## #235 T7 ER

- [x] Decided 2026-11-05 (D185; MIGRATION.md "Neo gradient", #236): column rules take the gradient colour at their x; v12 drew each half gradientStart, half gradientStop (0.0001-wide polygons).

## #236 T8 close

- [x] Gallery: every type's baselines in `neo` and `neo-dark`; dark themes on their own background; `/gallery?themes=…` on the dev server (tickets/236.md).
- [x] Docs: R-THEME-7 done, theming.md gradient row, MIGRATION.md gradient and D184–D189 lines.
- [ ] Maintainer review of the gallery (tailnet URL in the PR).
