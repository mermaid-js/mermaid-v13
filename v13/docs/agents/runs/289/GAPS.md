# Gaps — spec #289

Unmet criteria, shared contracts and choices made without the maintainer, by owning ticket.

## Held (blocked outside this spec)

- [x] #285 merged into the integration branch from `feature/285_shared-jison-oracle` (PR #346, ready). T1 #300 is unblocked.

## #300 T1 lexer (from the exploration, `01-v12-quadrant.md`)

Quirks the spec does not list, probed on 12.2.0; each needs a named parity case:
- a trailing `%%` comment stays inside `title`, `accTitle` and `accDescr` text (`title T %% c` → `T %% c`);
- `quadrant-1 ""` is rejected (`string` mode pops before emitting STR);
- `:` never appears in unquoted text;
- `P:\n[0.1, 0.2]` and `quadrantChart x-axis A` on one line are accepted;
- `classDef a_b …` is rejected (classDef names exclude `_`), though `:::a_b` lexes;
- jison adds `\b` to bare word literals, so `titleCase: [0.1, 0.2]` is a point.

## #332 T3 layout (from the exploration)

- `oracle.parse(text, config)` resets config before `getQuadrantData()` runs, so builder parity must carry config through `%%{init}` in the text (or extend the oracle additively).
- ~~Configured `0` differs from v12~~: false. v12's `getQuadrantData()` re-applies `getConfig().quadrantChart` after the `||` defaults, so v12 honours `0` too (review of #332, probed). No MIGRATION entry.
- v12 point x/y reach the builder as strings coerced by d3; v13 parses them once (D226 for non-numbers).

## #309 T0 (merged)

- **Choice:** the CSS form clamps each channel, `rgb(from <c> clamp(0, r + R, 255) … / alpha)`, not a bare `calc()`, because relative colour syntax keeps out-of-range channels; this matches `lightenHsl` (D117). Offsets are plain signed numbers, accepted only as `adjust` arguments. Core gz +253 B (22,833 → 23,086).

## #332 T3 (merged; handoff `tickets/332.md`)

- [x] **Done in #301:** run the layout invariants and builder parity on parser-produced models: swap the parser's model in for `v12Quadrant(...).model` in `packages/conformance/src/quadrant/layout-parity.spec.ts`. T2 adopts `QuadrantModel` (`packages/diagram-quadrant/src/model.ts`): an axis statement sets only the labels it names (v12 merge), overridden statements get `st:<ordinal>` and draw nothing.
- [ ] **Owner #312 T4:** remove quadrant's `NOT_YET_DRAWN` exemption in `tools/gen-config/src/theme-used-by.spec.ts`; grow the viewBox for point labels (D224); `fill`/`stroke` undefined in the layout means `quadrantPointFill`.
- [ ] **Owner #317 T5:** drop `"private": true`, add the manifest, a `feat: first release` changeset and the `publish.spec.ts` entry.
- **Choices:** axis end labels get `ax:x/end` / `ax:y/end` so each drawn label has one AST id (pitfall 12). The square's width/height clamp at 0 (v12 wrote negative `<rect>` sizes for schema-valid tiny charts). Coordinates convert with `Number(text)` like v12's d3; a dropped point still counts as "has points" (v12 layout). Builder parity sets options with v12's `initialize()`, since 12.2.0's `getDiagramFromText` drops `%%{init}` config.
- Size: 2.0 KB gz (layout only).

## #300 T1 (merged; handoff `tickets/300.md`)

- [x] All 13 quirks (7 in the spec, 6 found in exploration) have named cases checked on v12 and v13. Gate: 278 sources (e2e, harvested strings and docs, `quadrantDb.spec.ts` styles in statements, commented and line-separator variants), 100% token and text parity. Every jison rule fires except 41 (a duplicate `=` rule).
- [x] **#301 T2 (closed):** listed as two `reject` divergences in `divergences.json`. v12 removes an unclosed directive (`A %%{x}`); core's preprocess does not. Two such lexer cases were dropped from the gate as core behaviour. T2 checks the accept/reject result for that input against the oracle and lists it as a divergence if it differs.
- **Choice:** `src/parser/v12-text.ts` copies diagram-class's v12 source view (no cross-package imports; only T0 edits core). A candidate to move into the parser kit later.
- Size: 4.3 KB gz (lexer).
- [x] **#300 follow-up (`feature/300_lexer-fixes`, merged):** review found that `x-axis Low - --> High` lexes differently from v12 (the `-->` rule's failed-match skip swallows a following space). The commented gate variants silently drop 20 sources whose header got cut. The gate never compares source ranges (and a `class_name` error on an entity duplicates a range). The final NEWLINE range encloses a trailing comment. All four fixed: the gate now requires v12 detection or a justified `NOT_DETECTED` entry (28), compares an exact count (336 of 364), and checks source ranges over every source.

## #301 T2 (merged; handoff `tickets/301.md`)

- Parity: oracle accept/reject and model parity green; quadrant divergences are the two unclosed-directive `reject` entries. Grammar differential (corpus + 3,000 generated sentences), grammar-lexer gate, recovery set (23 errors / 11 cases), message fuzz, `v12-specs/` (27 pass, 2 skipped with reasons).
- **Choices:** one diagnostic per bad style; a style cut short by a syntax error is not also checked. An overridden `classDef` gets `st:<n>` like other overridden statements. Token kind `AxisDelimiter` renamed `AxisTextDelimiter` (gen:grammar matches kinds to terminals by name). `oracle.ts` gets one additive patch call (`quadrant/oracle-env.ts`) recording v12's DB calls.
- [x] **#321 T6 (closed):** probe support added (ProbeCursor, lexer start condition as mode).
- Size: parser 8.6 KB gz; package 10.4 KB gz.
- Review of #301 (≈30k inputs through model parity, no model, AST or performance defects). Follow-ups:
  - [x] **#321 T6 (done):** a class `ref` symbol was recorded before its point statement finished (`parser.ts:456`), leaving a stale symbol when the point failed (`P:::a: [0.1, 2]`).
  - [ ] **Owner #301 follow-up (after T4/T6):** `UNCLOSED_STRING` only fires when `"` starts a label; a later quote (`x-axis a "b⏎…`) gives a generic message that quotes the rest of the document. Junk before the header (`foo⏎quadrantChart`) gives a second, false "comes only once" diagnostic. Model parity runs only on e2e, v12-specs and quadrant-cases; extend it to the whole gate corpus (506 items agree today by hand).

## #321 T6 (handoff `tickets/321.md`)

- [x] T2 review: the `:::` class `ref` symbol is recorded only once its point statement completes (a failed point has no symbol, so rename leaves it alone).
- [ ] **Owner #317 T5:** add `quadrantChart` rows to `LEZER_HIGHLIGHTERS` / `MONARCH_HIGHLIGHTERS` (keyed by `FirstPartyFacetId`, which needs the manifest's `language` entry), run each adapter's `gen`, extend adapters-agree and first-paint specs, and drop the test-only row in `language-service/src/testing/unlisted-facets.ts`.
- **Choice:** style-key completions insert an example value (`radius: 10`): a key without a value is an error inside the inserted text.
- Size: `./language` 11.5 KB gz; parser 8.8 KB gz (+0.2 KB probe). R-LANG-4 timing not measured on a steady machine.
- Review of #321 (through `createLanguageService`). Follow-up on `feature/321_language-fixes`:
  - [ ] `:::` completion offers class names `:::` cannot read (`a-b`, `café`); `classDef ¦` offers `:::`-only names (`a_b`).
  - [ ] **Choice, reversing the earlier one:** a class ref is recorded whenever `:::name` lexes, even in a failed point, so rename covers it and the clash check sees it (recording only completed statements let `cold → warm` silently merge classes). The ref links to no statement.
  - [ ] `-->` offered before an existing `-->`; completion after a full `title` / `accDescr ` gives nothing.
  - [ ] **Choice:** only the effective (last) `classDef` of a name is the definition; earlier ones are references (v12: last wins; hover already shows the last).
