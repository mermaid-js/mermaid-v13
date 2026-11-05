# Gaps (spec #291)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Exploration findings (2026-11-05), see `01-v12-timeline.md` "Surprises"

### #308 T1 lexer
- [x] #285 merged into the integration branch at e5f920116 (PR #346 ready). Earlier: #285's oracle was not committed yet. Timeline's v12 DB is a module namespace, so sequence's `db.constructor` trick for a fresh `yy` does not apply: the descriptor must reset it with `clear()` (owner #285; check when it lands).
- A period named `timeline` is rejected (jison's implicit `\b`): kept, the oracle decides.
- [x] `yy` checked (#308): the timeline lexer's actions only call `begin`/`popState`, never `yy`, so the oracle's default (the DB namespace itself) is enough; the descriptor needs no `yy` builder and was not changed.
- [x] Review (#308): a CR and an LF that a removed comment or directive left side by side are two line ends (v12 turned CRs into LFs first). Fixed in the lexer and in core `cook` (shared: every type's images); `cook` also no longer walks every run per token (`SourceOffsets(runs, near)`). The gate adds a CR-cut copy of every source. A dropped `;` no token reaches is a `Space` trivia token. Core closure +1 B gz.
- Gate exclusions (listed in `packages/conformance/src/timeline/lexer-parity.spec.ts`): the `accDescr {` opener and its `}` (jison returns no token), comments and directives (trivia). The only sources v12 does not lex are commented copies of short bodies whose `%% cut` splits the `timeline` header, and CR-cut copies of sources with a multi-line directive; each is gated as written.

### #336 T2 parser
- [x] **Divergence listed:** v12's DB has no `setDiagramTitle`, so v12 drops a front-matter `title`. D218 draws it; `divergences.json` lists `timeline-cases/front-matter-title` (model). MIGRATION.md row owned by #311/#315.
- **Choice:** the AST is flat, one node per jison `statement` in source order (an event is not a child of its period); the model nests. Header is `st:1`; an event before any period (rejected) gets `st:<n>`.
- **Choice:** `TimelineModel.titleAst` added (the in-text title's `st:<n>`; undefined for a front-matter title), as quadrant's model has.
- **Choice:** recovery skips to the next line break, or to a token that starts on a later line: jison's `\s+` eats the line breaks after blanks, so `NEWLINE` alone would swallow the next line's error.
- [x] No probe yet (`ParseOptions.probe` is ignored): T6 (#318) adds it. Done in #318.

### #338 T4a palettes
- [x] v12's derivation differs per theme (forest derives as the spec says; default darkens twice and fixes slots 3–11; base and the neo/redux-dark themes darken by 25; dark and neutral use fixed lists; `cScaleInv` is `invert` in most themes and a 180° hue turn in default and forest; some `cScaleLabel` slots are special-cased). **Choice:** every theme's default values equal v12's exactly; under `primaryColor`/`secondaryColor`/`tertiaryColor` overrides the palette follows v12's rule wherever the DSL can express it (a small additive hue-rotation helper is allowed); any remaining difference is listed here.
  - Done with two DSL functions, `adjustHue(c, deg)` and `ifSet(v, fallback)`, and palette entries that are rules naming other slots (`invert(cScale3)`). The oracle spec `packages/conformance/src/theme-palettes.spec.ts` matches v12 exactly in all 11 themes: theme values, base-colour overrides, `primaryColor` alone, `darkMode`, `labelTextColor`, numbered and `cScale<n>` overrides.
  - Remaining difference: under `darkMode`, v12 turns the unset `primaryTextColor` of `base`, `neo`, `redux` and `redux-color` to `#eee` and their labels follow. v13's `darkMode` switches rules, not base colours (theme-wide, not palette-specific). Listed in the spec (`TEXT_UNDER_DARK_MODE`) and MIGRATION.md.
  - **Choice:** v12's `scaleLabelColor` is not a v13 variable (no ported diagram reads it); set `cScaleLabel` or `labelTextColor`. MIGRATION.md.
  - **Choice:** D181's "no per-item palette" for `neo`/`neo-dark` is read as the per-subgraph palettes (`borderColorArray`, `bkgColorArray`); both neo themes carry v12's `cScale*` as the ticket asks.
- [x] `cScale<n>` overrides are dropped today in every classic theme (no `cScale` list). T4a fixes it.
- [ ] No browser (Playwright) check of `adjustHue`/`ifSet` CSS: `e2e/browser/theme.spec.ts` is also edited by #309. Palettes are literal colours, so no render depends on that CSS yet. Add both to that test after #309 merges.

### #337 T3 layout
- [x] v12 TD advances sections by `height − 2·30`, so consecutive sections overlap by 30 px. **Choice:** the spec's "no overlaps" invariant wins; TD sections do not overlap: a section starts at v12's position or 30 px (`TASK_VERTICAL_GAP`) below what the previous group's rows hold, whichever is lower. Most sectioned TD input moves (pr-check/14 overlapped by about 11 px in v12). MIGRATION.md row (owner #311).
- [x] **Choice:** the LR axis ends at `width + 3·leftMargin` or at the last column's right edge, whichever is further: below a `leftMargin` of 25, v12's axis stopped short of the last period. Default config unchanged.
- [x] **Choice:** a section box is at least as tall as v12's `maxSectionHeight` and at least its own label (LR measures the floor at 150 px but draws at `200·n − 50`); the period row starts below the tallest drawn section. Identical to v12 for every corpus file.
- [x] **Choice (maintainer):** period height follows the real measurement of every period. v12 measured its virtual task node with `descr: task` (the task object, drawn as `[object Object]`), so its `maxTaskHeight` was always one line and only a tall period itself grew; v13 gives every period the height of the tallest, and the axis follows it (D252 assumes so). MIGRATION.md row owned by #311.
- [x] **Choice (maintainer):** a title taller than v12's one-line title box (a `<br>` title, D225, or a large `fontSize`) moves the content down by however far its bottom passes that box (a one-line title at v12's default 16 px). A default one-line title keeps v12's geometry. MIGRATION.md row owned by #311.
- [x] **Choice:** the TD axis starts below the title when the title spans the axis; v12 started it `2·fontSize` above the content, through any title wider than about 285 px (corpus nightly-check/13 and pr-check/14). Boxes keep their places. MIGRATION.md row owned by #311.
- LR connector length uses the virtual event heights (no 50 px floor), as v12; it can end above the last event of a long stack of one-line events (it always reaches the first). Kept.
- LR draws a connector for a period with no events; `disableMulticolor` does nothing when sections exist. Both kept (v12 behaviour).
- D251 says leading periods take slot 0 "as Pele does"; Pele actually paints them neutral. The decided answer (slot 0) stands.
- [x] Invariants run on parser-produced models (#336): `packages/conformance/src/timeline/layout-corpus.spec.ts`, the whole gate corpus, both directions, classic and redux, default and changed config.

### #318 T6 language facet
- [x] Probe wired (closes the #336 note): `ParseOptions.probe` records expected kinds and the jison start condition.
- **Choice:** goldens run through the service's test-only row (`language-service/src/testing/unlisted-facets.ts`, the class #159 / pie #307 mechanism) and live in `packages/language-service/goldens/timeline/` from the start, instead of sequence's conformance-only goldens spec that T5 moves: the row also runs the property, round-trip, completion-validity and code-point specs. T5 deletes the row when the manifest lands; nothing moves.
- [x] Folding follows D259 literally: a section's span runs to the start of the next `section`'s line (blank and comment lines included), the last one to the end of the text. Shared `language-service/src/folding.ts`: a range ending in an empty line keeps its last line break, so the fold ends on that empty line (no other type's golden changed).
- **Choice:** `accTitle:`/`accDescr:` with nothing after it at the very end reports its error zero-width after the keyword and its blanks (was the keyword), so a completed `accTitle: ` is not an error inside the inserted text.
- **Choice:** keyword completions match the prefix without regard to case (the lexer is case-insensitive); no `:` (event) or `accDescr {` item (not in the ticket's list). Each item is kept only where v12's lexer reads the completed text as that statement (one lex per offered item): none on the line after a bare `section`/`title` (their name), statements also on the header line and after `accDescr { … }`. An item adds no separator the text already has (`acc|Title: x` → `accTitle`, `acc|Descr {` keeps the block); at a word's first character nothing is replaced.
- [ ] Adapter highlighter rows (`LEZER_HIGHLIGHTERS`, `MONARCH_HIGHLIGHTERS`), adapter `gen`, `adapters-agree.spec.ts` and first-paint e2e cases: wait for the manifest's facet id (owner #315, listed in `tickets/318.md`).
- Budget (R-LANG-4) measured only on the loaded dev machine (cycle 3.2 ms median on 50k characters, completion at a line start); no `bench language:timeline` script.

### #311 T4 renderer
- [ ] v12's section classes are `section-<slot − 1>`: the first section is `section--1`. **Choice:** keep v12's numbering exactly, so existing author CSS still matches (P2); MIGRATION.md says so.
- Redux event label offset is `padding/2 + 3` in v12's code (the spec says `padding + 3`): follow the code (oracle).
- v12 TD writes no gradient defs, so its neo gradient CSS points at a missing id; v13's core defs make it draw (D182). MIGRATION.md row.

### #315 T5 integration
- [ ] Renderer fallbacks (`leftMargin` 50, `useMaxWidth` false) differ from the schema defaults (150, true). Use the effective v12 values with the default config merged (check in the oracle) and record any key whose effective value differs from its schema default.

### #338 review (2026-11-05), deferred
- [ ] No browser check that `adjustHue`/`ifSet` CSS forms resolve to the JS hex. Add the JS-vs-CSS case to the Playwright theme spec after #309 merges (that file is shared). Nothing renders those CSS forms yet: palettes are literal.
- [ ] **Size:** the CDN core closure is ~18 B under its 90,112 B gz budget after #338. The next core addition (#309, T4/T5) will likely cross it. Handle at M4 close with the size budget work (D217; the maintainer is open to +10–15%).
