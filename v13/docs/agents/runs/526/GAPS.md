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
- Found (review): core's preprocess reads an empty `---\n---` front-matter block, which v12 rejects before any railroad parser runs (case `header-empty-front-matter`, listed as not reached by v12). Core's behaviour, not the lexer's, and not among core's recorded front-matter divergences. **For the maintainer.**
- Review (T1, not fixed, out of scope): the railroad lexer's shared Langium terminal rules (title, accTitle, accDescr, YAML, directive, source mapping and memos), `tagQuotes()` and `placeholders()` are near-copies of the same code in about nine other Langium/jison lexers (wardley, radar, pie, info, packet, treemap, gitgraph, cynefin; entity placeholders also in gantt, journey, sequence, timeline, venn). A shared parser-kit helper is a cross-package refactor. **For the maintainer.**

## #610 T2 parser
- Exploration: all four v12 types share one DB object (each has its own parser object). `max: Infinity` serialises as `null` in a JSON snapshot: model parity normalises it. **Done** (`conformance/src/railroad/v12.ts`).
- **Choice (done):** the definition is child `0` of its rule, so ids are `rule:a/0`, `rule:a/0/1`, … (D517 leaves the root's path open).
- **Choice (done, revised in review):** core's `maxDepth` (100) caps the model's tree height (stacked EBNF postfixes included) with `DEPTH_LIMIT`, one per rule; groups that draw nothing (`((a))`) do not count. A separate stack guard stops at 500 open groups or calls (`NESTING_GUARD`; Node's default stack holds about 1,500 PEG groups). v12 had neither; nothing in the corpus or the fuzz reaches them.
- **Choice (done, review):** a rule that fails to parse leaves no symbols, AST node or model rule (its `def` and `ref` symbols are dropped with it).
- **Choice (done):** `detectRailroad` tests the text as core's registry tests a first-party row (`firstPartyDetects`), so a directive inside the header (`ra%%{…}%%ilroad-peg-beta`) reads as v12 read it (found by the fuzz).
- Found (fuzz): core's preprocess differs from v12 on unclosed or multi-line directives, indented or empty front matter and YAML its reader refuses (`? key` entries); `fuzz.spec.ts` leaves those inputs out (as cynefin's fuzz), counted in its output. `header-empty-front-matter` is listed in `divergences.json` (accept). Core's, **for the maintainer** (GAPS #608 already names the empty block).
- Ported specs: 30 of 141 skipped: the renderer (6) and styles (18) specs and the four loaders' `renderer` until T3/T4 (#612, #613: unskip in `scripts/port-v12-specs.ts`), and DB sanitising (2, R-SEC-2).

## #612 T3 layout
- **Choice (done):** D514's guard read as "every arc excursion reaches at least `max(extent + verticalSeparation, 2r)`": a choice's nearest branch on each side (and all beyond it) moves out to `2r` from the main line (the main line then sits off half height); an optional's bypass and a repetition's loop keep v12's `2r` gap unless `verticalSeparation` is larger. With v12's defaults only overshooting choices change. MIGRATION rows for both D514 fixes: T5.
- **Choice (done):** the layout is a tree mirroring v12's nested `g`s (offsets as v12's `translate`, paths in their group's coordinates), so T4 writes v12's transforms and path strings unchanged.
- **Choice (done):** texts are measured as raw strings (`measurer.width`, height `lineHeight`), not through `layoutLabel`: v12 wrote them with `.text()`, so `<b>` or `*` are literal. Lengths fall back to v12's defaults silently (v12's `sanitizeNumberValue`); fonts too until T5 adds `RAILROAD_CONFIG_INVALID`.
- **Choice (done):** `bounds` = v12's canvas grown over everything drawn (half stroke included), as packet's D344; a rule name in a large font can rise above its rule (v12 clipped it).
- The ported `railroadRenderer.spec.ts` stays skipped (it reads the DOM): T4 unskips it; its geometry is checked on the layout in `src/layout/layout.spec.ts`.

## #613 T4 renderer

## #615 T5 integration
- #637 wiring (moved on the merge of 18b902dcb): add `e2e/diagrams/railroad/hand-drawn.txt` (`unsketched`, D301) once railroad renders (the unsketched spec renders the folder); add `configDefaults: true`, `release:` (and `languageBundle:` from T6) to `packages/diagram-railroad/workspace.yaml` with the manifest; MIGRATION section goes to `v13/docs/migration/railroad.md`; drop `theme.notDrawnYet` in T4.
- Exploration: 12.2.0 already fixes neo-dark's `secondBkg` (once the literal `calculated`); tabulate from the oracle, not from older notes.

## #616 T6 language

## #617 T7 ascii
