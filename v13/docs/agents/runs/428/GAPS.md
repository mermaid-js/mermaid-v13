# Gaps (spec #428)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Treemap adds no core contract; no ASCII ticket (D320).
- **T5 after T6.** T5 (#514) is blocked by T6 (#511) too, so the manifest's `language` key and the registry follow-ups land once, in T5 (radar's order).
- **Theme table in T4.** The T0 (#414) is merged, so the spec's pure-call fallback in core is not used. T4 (#505) lands `src/theme/vocabulary.ts` with the plugin; T5 adds the oracle specs and DIFFERENCES.
- **`cScalePeer` shape (D406).** Diagram tables have no palette kind (`ThemeVarKind`); core's palettes are core's. Treemap's `cScalePeer` is twelve colour variables `cScalePeer0`–`cScalePeer11` in its own table, each derived from the matching `cScale` slot by trait. The author-facing numbered names stay as in v12.

## T1 (#483, merged)

- Gate: 696 sources (e2e, dev diagram, 28 harvested, 177 cases, each also CRLF and `commented()`), 685 lexed by v12, 78 with a lexer error, 0 diffs. Exclusion `unclosed-directive*` (core's shared directive reading, as pie, radar, packet), asserted still needed; 11 `NOT_LEXED` pinned.
- **Spec correction (not a deviation):** the spec says "the hidden `NL` and `%%` tokens are compared in `hidden`". `treemap.langium` declares `hidden terminal NL: /\r?\n/`, but Langium puts a hidden terminal whose regex is all whitespace in Chevrotain's `SKIPPED` group, so 2.0.1's `NL` (like `WS`) is in neither list. The gate compares `ML_COMMENT` in `hidden`, and drops v13's `Kind.Newline` (kept for T2's D401 diagnostics). For the maintainer: informational only.
- Review (orchestrator, `/code-review`): no hard violations. Accepted judgement calls: the lexer plumbing (`tagQuotes`, `brace` memo, `emit`/`trivia`/`dropAt`), the stress harness and the corpus loader copy radar's and pie's, as the recipe says. That's now four Langium lexers: extracting the shared plumbing into the parser kit is a follow-up outside this spec. "Both reject" on a lexer error is T2's (accept/reject parity).
- [x] **#484:** fix the `lineEnd` doc comment in `packages/diagram-treemap/src/parser/lexer.ts` (it says `[^\n]` but stops at LF or CR, as `isBreak`'s comment says).
  Done in #484: the comment says it stops at LF or CR, as `isBreak`.

## T2 (#484)

- Parity over the gate corpus: 843 sources, 826 agree (291 rejected by both), 6 listed divergences (`treemap-cases/unclosed-directive*`, core's). Grammar differential and 3000 sentences green (2999 accepted); ported specs 21 of 21; recovery set 36 cases (12 with several errors).
- **Choice (D401):** besides `TREEMAP_ROWS_ON_ONE_LINE`, the traps get their own codes: warnings `TREEMAP_TRAILING_BLANK` (a trailing blank, or one before an inline `%%`, that indents the next row: v12 accepts it and nests the row) and `TREEMAP_CLASSDEF_NEXT_LINE` (a `classDef` with no styles takes the next line), error `STRAY_BLANK` (the rejected trap, at the blank, naming `a blank at the end of line N`). A one-character class name is `UNEXPECTED` with `class names need two characters`. For the maintainer.
- **Choice (D402):** "values whose text `parseFloat` cut short" is read as: not digits with `,` only between groups of three (or at the end, as in `"a": 1, "b": 2`) and one `.`. So `1_000`, `1.2.3`, `1,2,3`, `1000,000` and `.` are listed; `1,000`, `01`, `1.`, `1,` are not. One warning per parse, at the first, the others `related`. For the maintainer.
- **Choice:** v12's `utils.test.ts` (the spec's T4 item) is ported in T2, as `src/v12-specs/utils.spec.ts`, since `buildHierarchy` is the model's tree building. T4 need not port it again.
- **Model contract for T3** (`packages/diagram-treemap/src/model.ts`): `roots` (nodes `type`, `name`, `value?` leaf only and maybe `NaN`, `classSelector?`, `depth` 0 at the top, `children`, `astId`), `classes`, `title?`, `titleAstId?`, `accTitle`, `accDescr`, `warnings`; `classStyles(model, name)` gives a node's v12 `cssCompiledStyles`. Later changes additive, listed here.
- Not in T2: probe hooks (`ParseOptions.probe` is ignored until T6 adds them) and class rename (D408), both T6's.

## T2 (#484, merged)

- Review (orchestrator, `/code-review`), fixed: inline diagram sources moved from `parse.spec.ts` and `conformance/src/treemap/parser.spec.ts` into `parser-*` cases in `corpus/treemap-cases.json`; one `excerpt()` helper; handoff numbers corrected.
- Accepted: the rule methods return `void` and fill instance collections, the same shape as radar's accepted parser (pitfall 6 read as radar reads it); the three extra D401 codes; the D402 "cut short" reading; porting `utils.test.ts` in T2; `@n` ids for repeated `title`/`accTitle`/`accDescr`. Parity leaves out the front-matter title, which v12's oracle never sees: the D218 fallback is covered by `parser-front-matter-title.mmd` and `parser.spec.ts`.
- The ported v12 specs need no oracle-backed skip (21 of 21 pass).

## T3 (#485)

- Rectangles equal d3-hierarchy 3.1.2's (reached from `mermaid-v12` through `createRequire`, no new dependency) on the gate corpus (858 sources with the 5 new `layout-*` cases, each with and without a title, 6 configs) and on 84 generated trees of 1–500 leaves × 6 configs. d3 writes NaN on 2 cases (`layout-huge-value`, `layout-overflow`), listed in `D3_NAN`; v13 lays them out finite. `valueFormat` equals v12's over d3-format 3.1.2 on 122 specifiers × 52 values (`corpus/treemap-value-format.json`). Invariants hold on both sets.
- **Model contract:** unchanged (nothing added).
- **Choice (R-LAYOUT-3 vs D405):** v12 clipped text to its box; v13 has no `clipPath`. A section label or value that does not lie inside its section is hidden; a "complex" (> 20 leaves) leaf label still wider than its box at the smallest size is truncated with `...` (v12 drew it clipped). For the maintainer.
- **Choice (D409):** `$` with a rest d3 rejects (`$abc`) made v12's render throw; v13 falls back to `,`, as v12 does for any other rejected specifier. For the maintainer.
- **Choice (D402):** a leaf whose value is not finite and positive takes no area (d3 wrote NaN for a 309-digit value); past a total of 2^500 the tiling weights are scaled by one power of two (d3 overflowed), which changes no rectangle. Values are still printed as d3 summed them (`Infinity`).
- **Choice (pitfall 16):** a class's `font-size`, `font-weight` and `font-family` set the font text is measured in (v12 wrote them after its own sizes, so they won; a leaf starts fitting at the class size). `em` and `%` resolve against the label's own default size, not the inherited 16 px.
- Smaller choices: header truncation steps by code point (v12 cut UTF-16 units, splitting emoji) with a binary search (pitfall 19); with no rows the bounds are the canvas (v12 drew the hidden root as one transparent leaf); the bounds include stroke half-widths and header bands; the title is 14 px from the metrics table until T4/T5 read `treemapTitleFontSize` (D407).
- `src/config.ts` is a stand-in until T5's schema: v12's defaults hard-coded, a value out of range falls back silently (T5 decides on a warning).
- Shared edit: `treemap` added to `fontFamily`'s `usedBy` (core vocabulary, `gen:theme` run: only `theme-variables.md` changed) and taken off `NOT_DRAWN_YET` in `theme-used-by.spec.ts`, since the layout reads `fontFamily`.
