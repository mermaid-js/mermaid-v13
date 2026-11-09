# Gaps (spec #520)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #560 T1 lexer and corpus
- Note (exploration): the parser spec has 37 `it` plus one `test.each`, 43 run tests (the spec says 38); the DB spec 10, the syntax page 9 examples. Corpus 172 files as the spec says.
- Note: Pele's source is not on this machine (`/Users/knsv/repos/pele/` is absent); only `pele@1.13.0`'s dist is under `packages/bench/node_modules/pele/dist`. It stays a reference only (D325).
- **Choice** (D431, for #564; kept after review: "it cannot break a document that renders today"): v12 accepts six forms only because its `\s+` swallows the line break after a blank: `requirement ⏎ a {`, `a - traces ⏎-> b`, `a - ⏎traces -> b`, `risk: ⏎high`, `requirement "a" ⏎{`, `"a" ⏎- traces -> b` (each `⏎` after a blank; `requirement-cases/blank-split-*`). Read literally, D431 rejects them. The lexer gives such a line break its own kind, `NewlineAfterBlank` (`NEWLINE` to the gate), so T2 can take it as a `NEWLINE` only where the grammar needs a line break (D431's five places) and skip it elsewhere (v12's swallow): every document v12 accepts keeps its model, and the five rejections become accepts.
- **For the maintainer** (D432, read literally after review): a direction token is only `direction`, blanks and `TB|BT|RL|LR` then `\b` at a line start; the rest of the line lexes as usual. So `direction LR <more>` (e.g. `direction LR a - traces -> b`, `direction LR;`) now errors where v12 accepted it and dropped the rest, and `direction BT x direction TB` is BT (v12: TB). No corpus file has text after a direction. An indented direction token no longer holds its leading blanks (image only).
- **Choice** (D431): the style state is unchanged: a space is skipped and a line break ends the statement as in v12; a tab there is still a lexer error, trailing or not.
- Note: the `run` harvest gains `constants` (additive, `jison/types.ts`): the spec's `new RequirementDB()` holds the object-literal tables of v12's `requirementDb.ts` (risk, verify method, relationships), so the harvest records what v12's tests parsed (`risk: High`, `a - contains -> b`): 39 spec strings and 9 docs, no harvested source D431 or D432 changes.
- Note: the gate compares against v12's lexer with D431's and D432's rules replaced (`TokensOptions.rules`, additive in `jison/oracle.ts`), not by skipping sources; `with-a-theme-default.mmd` (core's front matter after a blank line) and `directive-unclosed` (core's `UNCLOSED_DIRECTIVE`) are the only excluded ids. `jison/smoke.spec.ts` gained `NOT_LEXED` for `with-a-title-default.mmd`.

## #564 T2 parser
- Closed (from #560, D431): the six split forms v12 accepts (`requirement-cases/blank-split-name`, `blank-split-relation` (both forms), `blank-split-value`, `blank-split-quoted-brace`, `blank-split-quoted-relation`) are accepted with v12's own model: the parser takes a `NewlineAfterBlank` as the line break only after `requirementDiagram`, after `{` and after a field's value, and steps over it elsewhere. `conformance/src/requirement/parity.spec.ts` checks them by case id against plain mermaid@12, and every other source of the gate corpus against mermaid@12 with D431's and D432's lexer rules (`decidedOracle`, through the oracle's new additive `withRules`).
- Closed (from #560, D432): text after a line-start direction is one `UNEXPECTED` error for the rest of the line, the direction still set (`direction-then-relation`, `direction-trailing-text`, `direction-then-semicolon`, `direction-two-on-a-line`): `divergences.json` entries (reject), with the other D431/D432 cases (19 in all, owner #564).
- Closed: `REQUIREMENT_STYLE_DROPPED` (and the D434 warnings) list their statements in `related` and their AST ids in `astIds` (`RequirementWarning`, as sankey's `SankeyWarning`); core's `toWarning` copies `astIds` to the render warning. No core change. T5: add a `render()` spec asserting it.
- Closed: `visual-check/with-a-title-default.mmd` is still rejected by both; `visual-check/with-a-theme-default.mmd` is a listed `accept` divergence (core reads front matter after a leading blank line, `preprocess.spec.ts:98-100`).
- **Choice** (D433, "with a `LimitError`"): the parser never throws, so the style-copy cap is an error diagnostic with core's limit code `LAYOUT_LIMIT` (`LIMIT_CODES.maxLayoutWork`), which the pipeline turns into the same `MermaidError { code: 'LIMIT' }` a `LimitError` becomes (as ER's `NODE_LIMIT`). The cap is the fixed 1,000,000 (`MAX_STYLE_COPIES`, a parse option for tests), not the integrator's `maxLayoutWork`; it counts every entry `style`, `class`, `:::` and `classDef` add to a box's classes or styles or to a class's styles. Copying stops there.
- **Choice** (D434, "one warning" for shared names): its own code, `REQUIREMENT_SHARED_NAME`, beside `REQUIREMENT_DUPLICATE` and `REQUIREMENT_UNKNOWN_NODE`. Each D433/D434 warning is one per parse, at its first statement.
- **Choice** (D433, what is "lost"): a `style` naming a box not defined yet or never (v12 also stops there for the later names), a `class` or `a:::c` naming one, and a `classDef default` with boxes defined after it. A later `requirement a:::c` of a duplicate still classes the first box (v12), so it is not lost.
- **Choice** (R-PARSE-7): v12's `defineClass` scanned every box per class; the builder keeps the boxes of each class in a map, and stops all style work once the cap is hit, so every parse is linear (stress shapes in `requirement/stress.spec.ts`).
- **Choice**: an empty `accDescr {}` returns no token to jison's parser, so the parser steps over it anywhere (even inside a body), as v12 did; it adds no AST node (the grammar has none either).
- **Choice** (recovery): an error inside a body skips to the end of that line, inside the body; a statement keyword (or the end of the text) before a body's `}` is one `UNCLOSED_BLOCK` error and the statement is read; a header that fails before `{` still reads the body after a `{` on that line or the next.
- Note: the front-matter title is in the model (D218) but not compared in parity: the oracle never passes the front matter on (pie's and treemap's note). Symbols and the probe are T6's, as kanban's T2.

## #570 T3 layout

## #574 T4 renderer

## #579 T6 language facet

## #587 T5 integration
- Open: core writes `linkLabelBkg` only in redux-color and redux-dark-color, so D435's `inline(linkLabelBkg, edgeLabelBackground)` gives `#cccccc` (redux) and `#474949` (redux-dark), where v12 requirement draws `#FFFFFF` / `#16141F` in all four redux themes. Give `relationLabelBackground` a redux family value (light and `dark`) in the package table, or list the two in `DIFFERENCES`; prefer the family value (D435 says equal v12).
- Open: v12's renderer reads spacing, `titleTopMargin` and `useMaxWidth` from `state.*`; v13 reads the `requirement` section (class's precedent, spec). MIGRATION.md row. v12's defaults draw the 24 config-free corpus files as `redux-color`/neo.
- Open: tests use requirement as "the unsupported type": `packages/mermaid/src/api.spec.ts:86-94, 214, 606`, `packages/mermaid/src/cli.spec.ts:220-228`. Move them to a type no M5b port ships (check `registry.gen.ts` and the open M5b specs first; other ports may make the same edit).

## #588 T7 ASCII
