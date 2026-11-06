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

- [ ] **For the maintainer, core size (R-PERF-8): #369 is stopped over the CDN core gate.** `feature/369_gitgraph-palettes` (8b081f8e4 palettes, d45ae831e redux git palettes as literal data with the builders in lazy `scales.ts`): CDN gate (`cdn-build.spec.ts`) 93,901 → 94,452 B gz, **244 B over 94,208**; bench gate (`core-size.spec.ts`) 93,551 → ~94,080 (within). Cost on the CDN gate, +583 B before the cut: shared label rules in `LIGHT_RULES` 65 (exact `base`, R-THEME-5), generated variable-table rows 52, label font-size tokens 11, `theme.ts` slot regex and 8-slot limit 16, redux git data 28, the rest ≈412 (3 palette and 8 variable vocabulary entries, git builders, renaming); cut 1 −32. Not trimmed: the exact `base` label rules and the `tagBorder` alias (D267).
  - The ticket found a core bundling fix that is not gitGraph's: `THEME_VARIABLES` in `vocabulary.ts` is an object literal with spreads (`PIE_SLOTS`, the journey rows), so esbuild keeps the whole inventory with its `usedBy` lists in core, against its own "pure, so a bundle drops it" intent from #311. Wrapping it in a `/* @__PURE__ */` call (2 lines) saves about 1,372 B gz on the CDN gate. It is on its own branch, `fix/theme-variables-pure` (from `mermaid-v13`), not in #369. With it, #369 fits both gates (CDN 93,080, bench 92,714). The coordinator decides whether it lands first as its own PR, or whether per-diagram theme-variable tables move out of core instead.
- v12 needs no line break after the header: `gitGraph commit`, `gitGraph:commit`, `gitGraph TB: commit` parse (probed). The spec's grammar text implies a newline; the oracle decides (accept them).
- Duplicate ids (D264) do not always give a self-parent: for `A`, `B`, `A` the first `A` disappears, `B`'s parent is the later `A` and that `A`'s parent is `B`, a cycle. Model, layout (`findClosestParent`, ordering) and renderer must terminate on parent cycles; T2 adds such fixtures. A front-matter `title` exists in the corpus (nightly 66).

## #371 T3 layout

## #372 T6 language facet

## #373 T4 renderer
- [ ] Drop the `gitgraph` exemption in `tools/gen-config/src/theme-used-by.spec.ts` ("reads at least one variable"), added by #368.

## #374 T5 integration
