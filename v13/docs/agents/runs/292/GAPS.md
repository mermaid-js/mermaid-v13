# Gaps (spec #292)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Orchestrator

- **Choice:** the palettes (D267) are their own ticket, T4a #369, split out of T4/T5 as timeline did (#338). They are the only core change, so the core-size cost is measured alone, and they run in parallel with T1.

## Exploration findings (2026-11-06), see `01-v12-gitgraph.md` "Surprises"

## #368 T1 lexer
- `INT` beats `REFERENCE`: `branch 123` is rejected in v12 (not in the spec). The oracle decides; T1 reproduces it, T2 rejects it. Done in T1: reproduced and gated (quirks `branch 123`, `10abc`, `10.5`, `007`).

- Review note (#368): `runSpec` swallows async rejections, so a v12 test that parses again after an `await` would lose that source. Every gitGraph test parses once before its first await today (68 sites, 69 sources with the `__proto__` loop), so nothing is lost; kept.

## #369 T4a palettes
- D267 says v12 ignores a user's `tagLabelBorder`; probing shows every v12 theme re-applies user overrides after deriving, so a user's `tagLabelBorder`, `git<n>` and `gitBranchLabel<n>` win in every theme. D267's outcome (honour it, `tagBorder` an alias) still matches v12; the spec's reasoning is what is off. MIGRATION.md should not claim a change there.
- Core's `NUMBERED_PALETTES` / `PALETTE_LIMIT` assume 12 slots; the git palettes have 8 (D267), and git's hue steps are not core's `HUE_STEPS`. T4a extends this additively (per-palette slot count).
- Done (#369): `PALETTE_LIMITS` / `GIT_PALETTE_LIMIT` (8); `gitPalettes` + `gitSources` in `specs/palettes.ts`. `default` runs `updateColors` in its constructor too, so its git palettes and commit/tag labels are fixed lists (the constructor's values stepped again) that ignore base colours, `labelTextColor` and an author's `git<n>` for `gitInv`. `dark`, `forest` and `neutral` set `labelTextColor` themselves before the git block (lightgrey, `actorTextColor`, `#333`), so a user `labelTextColor` does not reach their branch labels.
- Left (listed in `conformance/src/git-palettes.spec.ts` `LEFT`): `base`'s `tagLabelBorder` is v13's `primaryBorderColor` (v12 `mkBorder` is a saturation step the DSL lacks; `base` may carry no rules, R-THEME-5), off by default and under overrides; the other themes pin v12's resolved border behind `ifSet(primaryBorderColor, …)`, so they do not follow `primaryColor` either (v12 only follows it in `base`). Under `darkMode`, `tagLabelColor` of `base`, `neo`, `redux`, `redux-color` keeps the theme text colour (v12 `#eee`, same gap as #338).
- Not added: v12 `branchLabelColor` (base/neo/redux/neutral read it; set `gitBranchLabel` instead) and `commitLineColor` (redux `'#BDBCCC'`, `styles.js`), which T4 owns if it needs it.

## #370 T2 parser
- v12 needs no line break after the header: `gitGraph commit`, `gitGraph:commit`, `gitGraph TB: commit` parse (probed). The spec's grammar text implies a newline; the oracle decides (accept them).
- Duplicate ids (D264) do not always give a self-parent: for `A`, `B`, `A` the first `A` disappears, `B`'s parent is the later `A` and that `A`'s parent is `B`, a cycle. Model, layout (`findClosestParent`, ordering) and renderer must terminate on parent cycles; T2 adds such fixtures. A front-matter `title` exists in the corpus (nightly 66).

## #371 T3 layout

## #372 T6 language facet

## #373 T4 renderer
- [ ] Drop the `gitgraph` exemption in `tools/gen-config/src/theme-used-by.spec.ts` ("reads at least one variable"), added by #368.

## #374 T5 integration
