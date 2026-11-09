# Gaps (spec #526)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #605 T0 gen:grammar
- **Choice (done):** a `GrammarTarget` names its `package` and `grammar` file when they differ from `type`; `type` stays an identifier (`railroadEbnf`) because it names the generated tables (`railroadEbnfCategories`). Each grammar other than the package's own writes `src/generated/<grammar>.categories.ts` and `.docs.ts`; highlighters `grammar/generated/<grammar>.*`; syntax doc `v13/docs/syntax/<grammar>.md`. Two grammars that would write one file are refused.
- For T6: `packages/language-service-codemirror/scripts/lezer.ts` and the Monaco `gen` read one `grammar/generated/<id>.grammar` per facet id; four railroad highlighters need those scripts (and `LEZER_HIGHLIGHTERS` / `MONARCH_HIGHLIGHTERS`) to take a grammar per detected type. T0 leaves the adapters unchanged.

## #608 T1 lexer
- Exploration: `@mermaid-js/parser@2.0.1` exports `createRailroadServices` (`Railroad`), `createRailroadEbnfServices` (`RailroadEbnf`), `createRailroadAbnfServices` (`RailroadAbnf`), `createRailroadPegServices` (`RailroadPeg`); each `.parser.Lexer` has `tokenize`. The 106-source harvest dry run matches the spec (IR 44, EBNF 26, ABNF 17, PEG 19).
- Exploration: Langium gives some punctuation a hidden longer alternative (EBNF `(`, `?`, `-`; ABNF `;`): that is why ABNF `; b = …` on one line is a comment. The lexers copy it.
- **Choice (done):** one shared token-kind module (`src/parser/tokens.ts`) and one shared base lexer (`src/parser/lexer.ts`), with one subclass per notation under `src/parser/<notation>/lexer.ts`; Chevrotain names per notation in `langium-names.ts`.
- Found: ABNF `;` followed only by blanks is also a comment (`a = "x" ;␠␠` never ends the rule). A `#name;` entity where a PEG `#` comment starts is a lexer error in v12 (its placeholder starts with `ﬂ`). Both gated.

## #610 T2 parser
- Exploration: all four v12 types share one DB object (each has its own parser object). `max: Infinity` serialises as `null` in a JSON snapshot: model parity normalises it.

## #612 T3 layout

## #613 T4 renderer

## #615 T5 integration
- Exploration: 12.2.0 already fixes neo-dark's `secondBkg` (once the literal `calculated`); tabulate from the oracle, not from older notes.

## #616 T6 language

## #617 T7 ascii
