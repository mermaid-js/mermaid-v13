# Gaps (spec #288)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0.** The `opacity` theme-variable kind (D221) is additive to the core vocabulary, so it lands in T5 (#325) as the spec says, not as a contract-change T0.

## #304 T1 lexer (merged)

- Review findings left to later tickets (none blocking):
  - [ ] **#305:** `harvest-pie.ts` drops literals containing `${`, so the interpolated `it.each` strings of parser `pie.test.ts` are not harvested (27 of 32 kept). Expand the tables by hand into the quirks or the ported specs so those shapes reach the gate. Its `\\\n` continuation branch in `unescape` is unreachable for quoted literals.
  - [ ] **#306/#325:** drop the pie exemption in `tools/gen-config/src/theme-used-by.spec.ts` ("reads at least one theme variable") once the renderer reads theme variables.
  - [ ] **#325:** `LANGIUM_NAMES` (test-only) and `pieTokens` are exported from the runtime entry; move them to a test or internal subpath if they show up in the load-path size.
- Deviations (accepted by the orchestrator, consistent with D220): the lexer-error position is compared as the length of the text v12 read before it (entities decoded), since v12 and v13 offsets differ; unclosed `%%{` directives are a listed gate exclusion (core's `UNCLOSED_DIRECTIVE`, shared by every type). An in-body `---…---` block is its own `Yaml` trivia kind in `PIE_TRIVIA`; #305 skips it.

## #325 T5 integration (known before start)

- [ ] **Theme DSL gaps** (`01-v12-pie.md` §4): no hue-rotate `adjust` in `core/src/theme/dsl.ts`; `taskTextDarkColor` and `mainContrastColor` (v12's pie title/legend colours) are not in the vocabulary; dark and neutral have no `cScale` palette. Store v12's computed values as literals where a derivation is missing (as `specs/neo-dark.ts:26` does), rather than growing the DSL; keep any vocabulary addition additive.
- [ ] **Test-only `pie-fixture` adapter** (`packages/conformance/src/fixtures/pie-plugin.ts`): must not clash with the real `pie` adapter (#305) or the manifest (#325).
- [ ] **Specs that assume pie is unported**: `packages/mermaid/src/cli.spec.ts:221-224`, `e2e/language/codemirror.spec.ts:254-257`, maybe `packages/mermaid/src/registry-rules.spec.ts:48`, :73.
