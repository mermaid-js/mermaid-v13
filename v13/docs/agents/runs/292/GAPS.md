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

## #370 T2 parser
- v12 needs no line break after the header: `gitGraph commit`, `gitGraph:commit`, `gitGraph TB: commit` parse (probed). The spec's grammar text implies a newline; the oracle decides (accept them). Done in T2: accepted, parity-checked (quirks and parser cases).
- Duplicate ids (D264) do not always give a self-parent: for `A`, `B`, `A` the first `A` disappears, `B`'s parent is the later `A` and that `A`'s parent is `B`, a cycle. Model, layout (`findClosestParent`, ordering) and renderer must terminate on parent cycles; Done in T2: parser cases 26–29 (and `parse.spec.ts`) pin the cycle in the model; T3/T4 still owe termination. A front-matter `title` exists in the corpus (nightly 66).
- **Choice:** derived ids (D260) also skip every `id:` written later in the text, not only ids already used: otherwise `commit` + `commit id:"0-9e3779b"` collapses two commits where v12 (random digits) keeps both. Same text, same ids still holds.
- **Choice:** v13's DB-check messages are its own wording (R-ERR-2); the ported specs' adapter rewords them as v12 did. A statement with a syntax error changes nothing and gets no AST node; one with a DB error keeps its node (pie's rule).
- **Choice:** five ported `getConfig` tests are skipped (no DB config; the config section is #374's); three Langium tests are skipped because mermaid@12 rejects their text (oracle-checked).

## #371 T3 layout

## #372 T6 language facet

## #373 T4 renderer
- [ ] Drop the `gitgraph` exemption in `tools/gen-config/src/theme-used-by.spec.ts` ("reads at least one variable"), added by #368.

## #374 T5 integration
