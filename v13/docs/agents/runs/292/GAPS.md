# Gaps (spec #292)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Orchestrator

- **Choice:** the palettes (D267) are their own ticket, T4a #369, split out of T4/T5 as timeline did (#338). They are the only core change, so the core-size cost is measured alone, and they run in parallel with T1.

## Exploration findings (2026-11-06), see `01-v12-gitgraph.md` "Surprises"

- Maintainer (via the coordinator, 2026-11-06): "Wave 2 first". gitGraph lands before the Theme T0 (D322, #411); gitGraph's theme variables stay in the existing core vocabulary pattern, with any new table in core built in a pure call (the #410 guard in `cdn-build.spec.ts`), and the T0 moves them out of core later. For the maintainer: say so in the PR body.

## #368 T1 lexer
- `INT` beats `REFERENCE`: `branch 123` is rejected in v12 (not in the spec). The oracle decides; T1 reproduces it, T2 rejects it. Done in T1: reproduced and gated (quirks `branch 123`, `10abc`, `10.5`, `007`).

- Review note (#368): `runSpec` swallows async rejections, so a v12 test that parses again after an `await` would lose that source. Every gitGraph test parses once before its first await today (68 sites, 69 sources with the `__proto__` loop), so nothing is lost; kept.

## #369 T4a palettes
- D267 says v12 ignores a user's `tagLabelBorder`; probing shows every v12 theme re-applies user overrides after deriving, so a user's `tagLabelBorder`, `git<n>` and `gitBranchLabel<n>` win in every theme. D267's outcome (honour it, `tagBorder` an alias) still matches v12; the spec's reasoning is what is off. MIGRATION.md should not claim a change there.
- Core's `NUMBERED_PALETTES` / `PALETTE_LIMIT` assume 12 slots; the git palettes have 8 (D267), and git's hue steps are not core's `HUE_STEPS`. T4a extends this additively (per-palette slot count).
- Done (#369): `PALETTE_LIMITS` / `GIT_PALETTE_LIMIT` (8); `gitPalettes` + `gitSources` in `specs/palettes.ts`. `default` runs `updateColors` in its constructor too, so its git palettes and commit/tag labels are fixed lists (the constructor's values stepped again) that ignore base colours, `labelTextColor` and an author's `git<n>` for `gitInv`. `dark`, `forest` and `neutral` set `labelTextColor` themselves before the git block (lightgrey, `actorTextColor`, `#333`), so a user `labelTextColor` does not reach their branch labels.
- Left (listed in `conformance/src/git-palettes.spec.ts` `LEFT`): `base`'s `tagLabelBorder` is v13's `primaryBorderColor` (v12 `mkBorder` is a saturation step the DSL lacks; `base` may carry no rules, R-THEME-5), off by default and under overrides; the other themes pin v12's resolved border behind `ifSet(primaryBorderColor, …)`, so they do not follow `primaryColor` either (v12 only follows it in `base`). Under `darkMode`, `tagLabelColor` of `base`, `neo`, `redux`, `redux-color` keeps the theme text colour (v12 `#eee`, same gap as #338).
- Not added: v12 `branchLabelColor` (base/neo/redux/neutral read it; set `gitBranchLabel` instead) and `commitLineColor` (redux `'#BDBCCC'`, `styles.js`), which T4 owns if it needs it.

- [x] **For the maintainer, core size (R-PERF-8): #369 stopped over the CDN core gate; resolved by #410.** `feature/369_gitgraph-palettes` (8b081f8e4 palettes, d45ae831e redux git palettes as literal data with the builders in lazy `scales.ts`): CDN gate (`cdn-build.spec.ts`) 93,901 → 94,452 B gz, **244 B over 94,208**; bench gate (`core-size.spec.ts`) 93,551 → ~94,080 (within). Cost on the CDN gate, +583 B before the cut: shared label rules in `LIGHT_RULES` 65 (exact `base`, R-THEME-5), generated variable-table rows 52, label font-size tokens 11, `theme.ts` slot regex and 8-slot limit 16, redux git data 28, the rest ≈412 (3 palette and 8 variable vocabulary entries, git builders, renaming); cut 1 −32. Not trimmed: the exact `base` label rules and the `tagBorder` alias (D267).
  - The ticket found a core bundling fix that is not gitGraph's: `THEME_VARIABLES` in `vocabulary.ts` is an object literal with spreads (`PIE_SLOTS`, the journey rows), so esbuild keeps the whole inventory with its `usedBy` lists in core, against its own "pure, so a bundle drops it" intent from #311. Wrapping it in a `/* @__PURE__ */` call (2 lines) saves about 1,372 B gz on the CDN gate. It is on its own branch, `fix/theme-variables-pure` (from `mermaid-v13`), not in #369. With it, #369 fits both gates (CDN 93,080, bench 92,714). The coordinator chose to land it first as its own PR: mermaid-js/mermaid-v13#410 (`THEME_VARIABLES` and `PIE_SLOTS` in pure calls, plus a `cdn-build.spec.ts` guard that the ESM static closure names no `usedBy`; CDN 93,898 → 92,520, bench 93,551 → 92,181). #369 merged on top of it: CDN 93,011, bench 92,645.
  - Review (#369): `timelineRadius`'s alias had been renamed to `gto`, colliding with `tagLabelBorder`; restored to `tlr`, and `theme-inventory.spec.ts` now asserts every alias is unique.

## #370 T2 parser
- v12 needs no line break after the header: `gitGraph commit`, `gitGraph:commit`, `gitGraph TB: commit` parse (probed). The spec's grammar text implies a newline; the oracle decides (accept them). Done in T2: accepted, parity-checked (quirks and parser cases).
- Duplicate ids (D264) do not always give a self-parent: for `A`, `B`, `A` the first `A` disappears, `B`'s parent is the later `A` and that `A`'s parent is `B`, a cycle. Model, layout (`findClosestParent`, ordering) and renderer must terminate on parent cycles; Done in T2: parser cases 26–29 (and `parse.spec.ts`) pin the cycle in the model; T3/T4 still owe termination. A front-matter `title` exists in the corpus (nightly 66).
- **Choice:** derived ids (D260) also skip every commit and merge `id:` written later in the text (cherry-pick `id:`s are references), not only ids already used: otherwise `commit` + `commit id:"0-9e3779b"` collapses two commits where v12 (random digits) keeps both. Same text, same ids still holds.
- **Choice:** v13's DB-check messages are its own wording (R-ERR-2); the ported specs' adapter rewords them as v12 did. A statement with a syntax error changes nothing and gets no AST node; one with a DB error keeps its node (pie's rule).
- **Choice:** five ported `getConfig` tests are skipped (no DB config; the config section is #374's); three Langium tests are skipped because mermaid@12 rejects their text (oracle-checked).

- **Shared-file edit:** `packages/conformance/src/flowchart/probe.spec.ts` timeout 60 s → 180 s (assertions and source set unchanged). The sweep probes every `PARITY_SUITES` source (≈4,200 with gitGraph's); on a loaded machine (load ~20) it ran 55–60 s and timed out. `parseFlowchart` over all of them is 0.85 s, gitGraph's no slower than the rest: a bigger sweep, not a regression.

## #371 T3 layout
- **Choice:** where v12 drew branch labels over each other (TB: a long name after a short one, as `setBranchPosition` spaces by the previous name only; LR: names of four or more lines), the lane moves out until the boxes are 10 apart (`GIT_METRICS.branchLabel.labelGap`). Elsewhere v12's positions stand (as D224 for clipping). MIGRATION.md (T5).
- **Choice:** parent cycles (D264): only parents with a smaller `seq`, never the commit itself, count for `parallelCommits`; a commit with none is placed as a root. v12 threw in BT parallel and drew pass-dependent positions in LR/TB. Arrows run in seq order (v12: DB insertion order, which differs only for duplicate ids).
- **Choice:** branch label text sits centred in its box less 2 px, with v12's first baseline 1em below; TB redux comes out 1 px below v12's `-2·padY + 7`.
- Core: `usedBy` (documentation, not in the bundle) lists `gitgraph` for the six variables the layout reads; core size unchanged (bench 92,645 before and after).
- For T5: eight geometry variables (`GIT_GEOMETRY`, ticket 371.md), two signed (`gitLaneOffset` −2/7, `gitBranchLabelOffsetX` 0/−11). Until then `geometryOf` falls back to classic values for names core does not know.
- [x] Invariants on parser-produced fixtures: `conformance/src/gitgraph/layout-corpus.spec.ts` (`parseGitGraph` over the gate corpus, LR/TB/BT, parallel on/off, classic/redux, default and changed options), after T2 merged.

## #372 T6 language facet

## #373 T4 renderer
- [x] Drop the `gitgraph` exemption in `tools/gen-config/src/theme-used-by.spec.ts` ("reads at least one variable"), added by #368. Done in #371: the layout reads `fontFamily`, `fontSize`, `fontWeight`, `strokeWidth`, `commitLabelFontSize`, `tagLabelFontSize` (their `usedBy` lists `gitgraph`). T4 adds `gitgraph` to what the renderer reads; T5 to the geometry variables (the scan sees the `GIT_GEOMETRY` names once they exist).

## #374 T5 integration
