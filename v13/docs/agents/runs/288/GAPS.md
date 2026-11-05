# Gaps (spec #288)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0.** The `opacity` theme-variable kind (D221) is additive to the core vocabulary, so it lands in T5 (#325) as the spec says, not as a contract-change T0.

## #304 T1 lexer (merged)

- Review findings left to later tickets (none blocking):
  - [x] **#305:** `harvest-pie.ts` drops literals containing `${`, so the interpolated `it.each` strings of parser `pie.test.ts` are not harvested (27 of 32 kept). Expand the tables by hand into the quirks or the ported specs so those shapes reach the gate. Its `\\\n` continuation branch in `unescape` is unreachable for quoted literals.
    - Closed by #305: all 32 `pie.test.ts` strings are in `pie-v12-specs.json`; the 5 missing from the count are duplicates within the `it.each` tables (none contains `${`). The whole file is also ported (`src/v12-specs/langium-pie.spec.ts`).
  - [ ] **#306/#325:** drop the pie exemption in `tools/gen-config/src/theme-used-by.spec.ts` ("reads at least one theme variable") once the renderer reads theme variables.
  - [ ] **#325:** `LANGIUM_NAMES` (test-only) and `pieTokens` are exported from the runtime entry; move them to a test or internal subpath if they show up in the load-path size.
- Deviations (accepted by the orchestrator, consistent with D220): the lexer-error position is compared as the length of the text v12 read before it (entities decoded), since v12 and v13 offsets differ; unclosed `%%{` directives are a listed gate exclusion (core's `UNCLOSED_DIRECTIVE`, shared by every type). An in-body `---…---` block is its own `Yaml` trivia kind in `PIE_TRIVIA`; #305 skips it.

## #305 T2 parser (merged)

- Deviations (orchestrator: accepted; listed for the maintainer):
  - fixed a #304 lexer bug: an in-body YAML block tries the regex's optional middle first, so `---\n---\n…\n---` is one block to the last closing line (three gate quirks pin it);
  - unclosed `%%{` directives stay out of parity, as in the lexer gate (core's `UNCLOSED_DIRECTIVE`); a spec checks they differ only there;
  - a negative section is left out of the model and does not shadow a later section with the same label (v12 rejects the whole text anyway);
  - a repeated `title`/`accTitle`/`accDescr` statement gets `title@2`, … (pitfall 9);
  - the parity oracle gets no front matter, so the parity parse holds the front-matter title back; the D218 fallback is covered by the package's own specs.
- [ ] **#306:** repeated-label and negative sections have AST nodes but no model section, so nothing draws them. The AST round-trip needs a rule for those nodes (e.g. the dropped repeat maps to the first slice's legend row, or such nodes are exempt with a reason).
- [ ] **#325:** `getConfig` ported spec is skipped (no DB config) until the config keys are honoured.

## #335 T3 layout (merged)

- [x] **Invariants on parser-produced fixtures**: closed by #305: `packages/conformance/src/pie/layout-corpus.spec.ts` (gate corpus × 5 legend positions × 3 option sets, 0 violations); `layoutPie`/`pieLayoutViolations` are now exported from the package entry for it. Was: not run, because #305 had not merged. Whoever merges second adds the corpus spec described in `tickets/335.md` (`pieLayoutViolations` over the e2e corpus parsed by the v13 parser). Owner: #305 if it merges after #335 (it does), else #306.
- [ ] **#325:** delete `PIE_THEME_DEFAULTS` in `layout/metrics.ts` (title/section/legend text sizes, stroke widths) once the pie variables exist; the layout already prefers a vocabulary entry of kind `length`.
- Deviations (orchestrator: accepted, consistent with P1/D226; listed for the maintainer):
  - an empty `highlightSlice` (the default) highlights nothing; v12 highlighted a slice labelled `""` (the default `''` matched it);
  - no sections gives legend offsets of 0 where v12 computed NaN (D226: never NaN);
  - the bounding box also covers the stroke widths and a highlighted slice drawn at 1.05 (D224: covers what is drawn).
- Shared edit: `pie` added to `fontFamily`'s `usedBy` (`core/src/theme/vocabulary.ts`, regenerated `theme-variables.md`).

## #325 T5 integration (known before start)

- [ ] **Theme DSL gaps** (`01-v12-pie.md` §4): no hue-rotate `adjust` in `core/src/theme/dsl.ts`; `taskTextDarkColor` and `mainContrastColor` (v12's pie title/legend colours) are not in the vocabulary; dark and neutral have no `cScale` palette. Store v12's computed values as literals where a derivation is missing (as `specs/neo-dark.ts:26` does), rather than growing the DSL; keep any vocabulary addition additive.
- [ ] **Test-only `pie-fixture` adapter** (`packages/conformance/src/fixtures/pie-plugin.ts`): must not clash with the real `pie` adapter (#305) or the manifest (#325).
- [ ] **Specs that assume pie is unported**: `packages/mermaid/src/cli.spec.ts:221-224`, `e2e/language/codemirror.spec.ts:254-257`, maybe `packages/mermaid/src/registry-rules.spec.ts:48`, :73.

## Shared contracts

- **`PieModel`** (`packages/diagram-pie/src/model.ts`): landed by the orchestrator before #305 and #335 started in parallel, shaped from the spec's model list. #305 produces it; #335 reads it. Change it only additively and note the change here.
  - #305: unchanged. `parsePie` fills it as documented (frozen; `title` absent when neither an in-text nor a front-matter title).
