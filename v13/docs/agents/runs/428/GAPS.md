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

- Parity over the gate corpus: 822 sources, 805 agree (294 rejected by both), 6 listed divergences (`treemap-cases/unclosed-directive*`, core's). Grammar differential and 3000 sentences green; ported specs 21 of 21; recovery set 36 cases (12 with several errors).
- **Choice (D401):** besides `TREEMAP_ROWS_ON_ONE_LINE`, the traps get their own codes: warnings `TREEMAP_TRAILING_BLANK` (a trailing blank, or one before an inline `%%`, that indents the next row: v12 accepts it and nests the row) and `TREEMAP_CLASSDEF_NEXT_LINE` (a `classDef` with no styles takes the next line), error `STRAY_BLANK` (the rejected trap, at the blank, naming `a blank at the end of line N`). A one-character class name is `UNEXPECTED` with `class names need two characters`. For the maintainer.
- **Choice (D402):** "values whose text `parseFloat` cut short" is read as: not digits with `,` only between groups of three (or at the end, as in `"a": 1, "b": 2`) and one `.`. So `1_000`, `1.2.3`, `1,2,3`, `1000,000` and `.` are listed; `1,000`, `01`, `1.`, `1,` are not. One warning per parse, at the first, the others `related`. For the maintainer.
- **Choice:** v12's `utils.test.ts` (the spec's T4 item) is ported in T2, as `src/v12-specs/utils.spec.ts`, since `buildHierarchy` is the model's tree building. T4 need not port it again.
- **Model contract for T3** (`packages/diagram-treemap/src/model.ts`): `roots` (nodes `type`, `name`, `value?` leaf only and maybe `NaN`, `classSelector?`, `depth` 0 at the top, `children`, `astId`), `classes`, `title?`, `titleAstId?`, `accTitle`, `accDescr`, `warnings`; `classStyles(model, name)` gives a node's v12 `cssCompiledStyles`. Later changes additive, listed here.
- Not in T2: probe hooks (`ParseOptions.probe` is ignored until T6 adds them).
