# v13 parser choice: Chevrotain vs hand-written, with editor tooling in view

Research date 2026-10-31. Everything below was measured or read locally. The scratch harness is in
`/Users/knsv/repos/mermaid-v13/.tmp/parser-research/`:

- `build.mjs` and `build-ext.mjs` bundle with esbuild 0.25.12, using minify, ESM, tree-shaking, platform neutral, es2022 and gzip -9.
- `bench.mjs`, `phases.mjs`, `startup.mjs`, `recperf.mjs` and `spans.mjs` are the timing scripts.
- `errors.mjs` produces the error comparison. Its full output is in `errors.out.txt`.
- `c13/` holds Chevrotain 13.2.0, the version v13 develop pins in `packages/mermaid/package.json:79`.

Sources:

- Chevrotain flowchart parser: `/Users/knsv/repos/mermaid`, branch `flowchart-chevrotain-parser` @ `700df567e`, files `packages/mermaid/src/diagrams/flowchart/parser/flow.{tokens,lexer,parser,visitor,chevrotain}.ts`. It was copied unchanged; only a recovery variant and a skipValidations variant were edited, as copies.
- Pele @ `3a2f075` (1.13.0), `src/diagrams/flowchart/{lexer,parser,tokens,db}.ts`.
- jison oracle: `flow.jison` from tag `mermaid@12.2.0`, compiled with jison 0.4.18. This is the generator Mermaid's build uses.
- Corpus: `/Users/knsv/repos/mermaid-v13-approches/corpus/perf/*.mmd` (13 files, 146–2,404 lines, 46–244 KB).

All three parsers wrote into **the same model**: Pele's `FlowDb`, which mirrors Mermaid's `FlowDB` method surface. So the timings measure parsing only. All three produced identical node, edge and subgraph counts on all 13 perf files (`bench.mjs` output, last column).

---

## 1. Size and speed (measured)

### 1.1 Bundle size, min and gzip (bytes)

| Bundle | min | gzip |
|---|---:|---:|
| **Chevrotain 13.2.0 runtime alone** (`CstParser, Lexer, createToken, EOF, defaultParserErrorProvider`) | 108,452 | **29,540** |
| **Chevrotain flowchart, full** (runtime + tokens + lexer + parser + visitor + entry) | 137,129 | **38,037** |
| Chevrotain flowchart grammar code only (`chevrotain` external) | 28,653 | **8,550** |
| ↳ split of the grammar code (min): parser 11.7 K, tokens 9.3 K, visitor 6.7 K, lexer 0.6 K, entry 0.4 K | | |
| Same, Chevrotain 11.1.2 (sibling-branch pin, pulls `lodash-es` 30 KB min) | 163,377 | 48,735 |
| Chevrotain 11.1.2 runtime alone | 134,695 | 40,018 |
| **Pele flowchart lexer + parser + tokens + errors** (`parseFlowchart`, same scope as Chevrotain's lexer+parser+visitor) | 19,465 | **7,158** |
| Pele parser + `FlowDb` (adds YAML for `@{}`, shapes, entities, url) | 40,471 | 15,703 |
| Pele parser + `FlowDb` + `preprocess` (front matter, directives, comments) | 43,054 | 16,765 |
| jison flowchart parser (generated tables, mermaid@12.2.0 grammar) | 41,125 | 12,241 |
| **Pele core + flowchart, complete** (parse + layout + SVG) | 144,263 | **57,075** |
| Pele core + flowchart **plus** Chevrotain flowchart | 281,781 | **95,018** |

What this means for the 80 KB gz target (D10):

- The Chevrotain runtime alone uses **37%** of the core+flowchart budget. Grammar plus runtime uses **48%**.
- Pele's whole flowchart parser costs 7.2 KB gz. That is less than the Chevrotain *grammar* alone (8.6 KB), before any runtime.
- Swapping Pele's parser for Chevrotain in a Pele-shaped core gives about 95 − 7 ≈ **88 KB gz**. That is over budget before v13 adds anything.
- `mermaid-current.md` §2 estimated Chevrotain at "~150–200 KB min". The measured figure is 108 KB min for 13.2.0, or 135 KB min for 11.x with lodash.
- The runtime is per page, not per diagram, so later diagrams amortise it. But flowchart-only pages, which are the D10 target, pay all of it.

### 1.2 Startup cost (import plus `performSelfAnalysis` and lexer analysis), Node 22, median of 3 runs

| Module | import+init |
|---|---:|
| Chevrotain runtime only | 2.1 ms |
| Chevrotain flowchart (parser singleton built at module load) | **18–20 ms** |
| Same with `skipValidations: true` on both the parser and the lexer | 13 ms |
| Pele flowchart parser | 0.5 ms |
| jison flowchart parser | 1.1 ms |

The first parse is also cold. On `huge2.mmd`, the first call took 20.7 ms with Chevrotain and 3.7 ms with Pele.

Each Chevrotain grammar pays this cost again: usecase, pie and every future diagram type each build their own parser at module load.

### 1.3 Parse speed (warm, median of 25 runs, ms, same `FlowDb` sink)

| file | lines | KB | Pele | Chevrotain | jison@12 | chev/Pele |
|---|---:|---:|---:|---:|---:|---:|
| huge1 | 2404 | 244 | 0.98 | 15.79 | 22.57 | 16.1× |
| huge2 | 1710 | 136 | 1.32 | 10.66 | 18.18 | 8.1× |
| huge3 | 210 | 153 | 0.43 | 3.84 | 4.69 | 8.9× |
| huge5 | 1212 | 110 | 0.69 | 5.73 | 9.36 | 8.3× |
| large1 | 812 | 72 | 0.98 | 7.00 | 11.54 | 7.1× |
| large2 | 146 | 76 | 0.22 | 1.92 | 2.49 | 8.7× |
| large4 | 175 | 74 | 0.17 | 1.78 | 2.28 | 10.5× |
| large5 | 812 | 72 | 0.78 | 6.86 | 11.58 | 8.8× |
| medium1 | 677 | 50 | 0.49 | 4.79 | 8.89 | 9.8× |
| medium2 | 803 | 46 | 0.82 | 5.92 | 10.00 | 7.2× |
| medium3 | 1197 | 48 | 0.37 | 3.34 | 6.29 | 9.0× |
| medium4 | 592 | 48 | 0.41 | 2.71 | 4.82 | 6.6× |
| medium5 | 484 | 48 | 0.74 | 5.17 | 7.96 | 7.0× |

- **Geomean: Chevrotain is 8.7× slower than Pele and about 1.6× faster than jison.**
- Phase split for Chevrotain on huge2: lexing takes 6.9 ms, parsing to CST 2.5 ms, visiting the rest. The lexer dominates. It uses many modes and custom patterns to stay token-for-token compatible with jison (`flow.lexer.spec.ts`).
- Parse time is small next to Mermaid 12's DOM costs (`mermaid-current.md` §0). It is not small next to v13's target. D10 asks for ≥50× over Mermaid 12, and Pele renders a medium diagram in a few ms in total, so a 5–15 ms parse would be a large share of v13's render time.
- `recoveryEnabled: true` had no measurable cost (1.70 vs 2.53 ms CST parse on huge2; the difference is noise).

---

## 2. Editor tooling that exists today, and what it depends on

| Where | What | Parser it depends on | Evidence |
|---|---|---|---|
| **mermaid.live** (`mermaid-live-editor`) | Monaco: Monarch regex tokenizer for highlighting, keyword and snippet completion, **one** error marker per document | None for highlighting or completion. The marker comes from `mermaid.parse` errors: it reads jison's `error.hash.loc` and falls back to a text heuristic (`findMostRelevantLineNumber`) | `src/lib/util/monacoExtra.ts:227` (`setMonarchTokensProvider`), `:590` (completions); `src/lib/util/state.svelte.ts:76-106` (`'hash' in error` → `hash.loc` → marker); `DesktopEditor.svelte:231` `setModelMarkers` |
| **Mermaid Chart app** (`collab/packages/app`) | Monaco plus `monaco-mermaid@1.1.0` and its own Monarch tokens. Completions are snippets only. The hover provider only injects an AI "Fix" button. One error marker | Same `hash.loc` dependency, plus a special case for `parser === 'antlr'` errors | `src/lib/client/util/monacoExtra.ts:274,697,861`; `components/View/View.svelte:868-915` |
| **Mermaid Chart visual editor**: bidirectional code↔SVG highlighting and AST-based code generation (round-trip edits) | `db.getAST()` returns a `FlowchartAST` with `elementMappings[{id,type,position{startLine,startColumn,endLine,endColumn,startIndex,endIndex}}]` and `getElementAtPosition(line,col)` | The **`@mermaid-chart/mermaid` fork** (`alana-mermaid`). It has an **ANTLR (antlr4ng) flowchart and sequence parser** behind feature flags `antlr-parser-flowcharts` and `antlr-code-gen-flowcharts`. The fork also added `@$` position capture to its jison grammar (23 sites) so jison can produce the same AST | collab `clientApi/visualEditor/FlowchartBidirectionalSync.ts`, `flowchartASTUtils.ts:59-84`, `codeGenerators/FlowChartDiagram.types.ts:133-173`, `codeGenerators/DiagramASTService.ts`; `util/mermaid.ts:161-165` (`parser: 'antlr' : 'jison'`); fork: `alana-mermaid/packages/mermaid/src/diagrams/flowchart/parser/antlr/` (FlowLexer.g4 424 + FlowParser.g4 339 + FlowchartASTBuilder 2,054 + ParserCore 1,839 LOC), `flowchart/flowDb.ts:875` `getAST()`, `:880-915` jison `@$` → `ElementPosition` with **front-matter line-offset compensation** |
| **agentflow-editor** | Monaco via `@mermaid-chart/monaco-host`; e2e tests for parse-error badges | Same `mermaid.parse` errors | `agentflow-editor/package.json:35,86` |
| Mermaid dev explorer (v12 and v13 repos) | CodeMirror 6 with `codemirror-lang-mermaid`, a community Lezer grammar used for **highlighting only** | Its own Lezer grammar, separate from Mermaid's parsers | `.esbuild/dev-explorer/code-editor.ts:1-20` |
| **`@mermaid-js/parser`** (Langium) | Uses `createDefaultCoreModule` / `LangiumSharedCoreServices` only. There is **no `langium/lsp` module and no language server**. Errors from all lexer and parser stages are joined into one `MermaidParseError` string. Flowchart is not a Langium grammar | Langium + Chevrotain | `packages/parser/src/language/*/module.ts` (core modules only; grep for `langium/lsp` finds nothing); `src/parse.ts:146-172` |
| usecase (v13 develop, Chevrotain) | `nodeLocationTracking: 'full'`, plus a **span read-model**: `NodeOccurrence{id, span, idSpan, labelSpan, defines, classSpans}`, `EdgeOccurrence`, `GraphStatement{kind, span, children…}`, exposed via `db.getAST()`, the same contract as the Mermaid Chart fork | Chevrotain, but the spans are built by hand in the visitor from token offsets | `usecase/parser/usecase.parser.ts:135`; `usecaseTypes.ts:174-260`; `usecase/parser/usecase.visitor.ts:93-130`; `usecaseDb.ts:79` |

None of these exist anywhere: a Mermaid LSP, go-to-definition, find references, rename, semantic tokens, folding, or more than one diagnostic per document. That covers all of `/Users/knsv/repos/*` (searched for `vscode-languageserver`, `langium/lsp`, `startLanguageServer`, `registerDefinitionProvider`, `registerFoldingRangeProvider` and `registerDocumentSemanticTokensProvider`). The only code-position features that do exist are:

- Mermaid Chart's code↔diagram highlighting and AST code generation, built on a **third** parser (ANTLR) in the fork.
- One error marker, built on jison's `hash.loc` object.

**Regression to watch:** the Chevrotain branch throws `new Error("Error parsing flowchart diagram: Expecting 'SQE' got 'EOF'")`, with **no `hash`, no line and no column** (`flow.chevrotain.ts:31-36`).

- mermaid.live and Mermaid Chart would fall back to the text heuristic for their marker.
- Whatever parser v13 uses, it must return **structured diagnostics with ranges**. The editors depend on that today.

---

## 3. Error quality on broken flowcharts (actual output)

Setup for the comparison:

- jison: compiled mermaid@12.2.0 grammar, with Mermaid's `}\s*\n` pre-step. Its message text is jison 0.4.18's own, so it is what Mermaid 12 shows.
- Chevrotain: the branch entry `parseFlowchartChevrotain`.
- Pele: `core.parse`.
- "chev+rec": the branch grammar with `recoveryEnabled: true`, the only change, listing `parser.errors`.
- Semantic errors such as `No such shape` come from the shared `FlowDb` in this harness.

**3.1 Missing arrow target at EOF.** Input: `A --> B` / `B -->`. Note that `B -->` followed by a node on the next line is *valid* Mermaid in all three parsers, which accept `-->\n C`.
```
jison: Parse error on line 4:
       ...D  A --> B  B -->
       --------------------^
       Expecting 'AMP', 'COLON', 'PIPE', 'TESTSTR', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', got 'EOF'
       hash.loc {first_line:3,last_line:4,first_column:3,last_column:0}
chev : Error parsing flowchart diagram: Expecting 'NUM', 'NODE_STRING', 'DOWN', 'MINUS', 'DEFAULT', 'COMMA', 'COLON', 'AMP', 'BRKT', 'MULT', 'UNICODE_TEXT' got 'EOF'
pele : Parse error on line 3:
         B -->
       -------^
       Expecting 'NODE_STRING', got 'EOF'          {line:3, column:8, code:'syntax'}
chev+rec: EarlyExitException L-1:C-1 …          (EOF token has no position → needs mapping)
```
**3.2 Double arrow** (`A --> --> B`): jison points at line 2 with 13 alternatives. Chevrotain gives the same list with no position. Pele gives `line 2, column 9: Expecting 'NODE_STRING', got 'LINK'`.

**3.3 Unclosed bracket** (`A[Start --> B` / `B --> C`). Label text mode swallows newlines in every engine, so the error lands at EOF.
```
jison: Parse error on line 4: … Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', '-)', 'STADIUMEND', … 15 names …, got '1'
chev : Error parsing flowchart diagram: Expecting 'SQE' got 'EOF'
pele : Parse error on line 3:  "  B --> C" ---------^  Expecting 'SQE', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got '$end'
```
None of the three points at the `[` that opened the label, which is the useful location. Pointing there needs a "while parsing label opened at L2:C4" note. A recursive-descent parser has that position on its stack for free (`i` at entry to `vertex()`). Chevrotain has it in `ruleStack`.

**3.4 Mismatched shape** (`A(Round] --> B`):
- jison: `line 2 … Expecting 'PE', 'TAGEND', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'SQE'`.
- Chevrotain: `Expecting 'PE' got 'SQE'`, with no position.
- Pele: `line 2, column 10 … Expecting 'PE', 'UNICODE_TEXT', 'TEXT', 'TAGSTART', got 'SQE'`.

**3.5 Bad shape name** (`A@{ shape: blob }`): all three report `No such shape: blob.`. This is a semantic error from the DB with **no position** in any engine.

**3.6 Unclosed subgraph:**
- jison: `line 5 … Expecting 'SEMI', 'NEWLINE', 'SPACE', 'EOF', 'subgraph', 'end', … 30 names …, got '1'`.
- Chevrotain: `Expecting 'end' got 'EOF'`.
- Pele: `line 4, col 10: Expecting 'end', got '$end'`.

None of them names the `subgraph one` that is still open.

**3.7 Bad classDef** (`classDef` with nothing after it): all three say `Expecting 'SPACE', got 'NEWLINE'`. That is technically correct and useless to a user; it should say "classDef needs a name and styles". jison and Pele give line 2; Chevrotain gives no position.

**3.8 Three independent errors** (`classDef` on line 3, `C(Round]` on line 4, `G --> --> H` on line 6):
```
jison : 1 error  (line 3 'Expecting SPACE got NEWLINE') — stops
chev  : 1 error  (no position) — stops
pele  : 1 error  (line 3 col 11) — stops
chev+rec: 3 errors
   EarlyExitException     L3:C11 Expecting 'SPACE' got 'NEWLINE'      ctx=classDefStatement>spaceList
   MismatchedTokenException L4:C10 Expecting 'PE' got 'SQE'           ctx=shapeBody>roundOrCircleShape
   EarlyExitException     L6:C9  Expecting 'NUM','NODE_STRING',… got 'LINK' ctx=vertex>idString
```

**Takeaways.**

1. Pele has the best *single* error today. It has a position, a snippet and the shortest accurate expected-set, and it is the only one with a stable `code`.
2. The branch Chevrotain wrapper has the worst, because it drops the position. The data is on `parser.errors[0].token`, so this is a five-line fix, not an inherent limit.
3. Only Chevrotain with `recoveryEnabled` reports several errors. It costs one flag, as long as the grammar uses `MANY`/`AT_LEAST_ONE` around statements, and it was 3/3 on independent line-level errors.
4. Every engine is equally bad at the human-level messages ("unclosed `[` opened at…", "subgraph `one` never closed", "classDef needs a name"). That is hand-written diagnostic work whatever the parser technology.
5. Semantic errors (shape names, YAML in `@{}`) have no position anywhere today.

---

## 4. What Pele and Ondine parsers produce: positions?

**Pele:**
- The lexer emits structure-of-arrays `{types:number[], texts:string[], starts:number[]}`, so **every token has a start offset** (`src/diagrams/flowchart/lexer.ts:5-9,66-71`).
- The parser reads `starts` **only** in `fail()` (`parser.ts:86-95`). It calls `db.addVertex/addLink/addSubGraph` with strings, and the `FlowDb` model (`db.ts:100-119`) holds **no positions**. It is a render model, not a syntax tree.
- Positions refer to the *preprocessed* text, after front matter, directives and comments are removed, entities encoded and quotes rewritten. Pele records these preprocessing edits as `Edit[]` and maps offsets back lazily (`errors.ts:27-48,67-90`, `core.ts:112-126`). That is exactly the machinery an LSP needs. The Mermaid Chart fork re-solved the same problem crudely with `setFrontmatterLineOffset` (`alana-mermaid/.../flowDb.ts:897-904`).

**Ondine:**
- Same design. `Token{kind, start: usize /*UTF-8*/, text: Cow<str>}` (`crates/compiler/src/diagrams/flowchart/lexer.rs:14-24`), used only for `Error::syntax` (`parser.rs:174-187`). The model has no spans.
- UTF-8 offsets in Rust vs UTF-16 in JS is a known portability trap (`ondine.md` §4 item 4). An LSP speaks UTF-16 by default.

**Neither produces a CST or AST.** Both throw on the first error and have no recovery.

**Cost of adding positions to a hand-written parser (measured).** The prototype is `parser-research/pele-spans/` (a copy of Pele). `idString()` now pushes `{id, start, end}` for every identifier occurrence: vertex definitions, edge endpoints, and `class`/`style`/`classDef`/`click` references. That is +3 lines.
- 2,922 occurrences on huge2 and 1,469 on large1.
- Total parse time over the 13 files: 8.27 ms plain vs 8.05 ms with spans, which is noise.
- Bundle: +2 bytes gz.

That alone is enough data for go-to-definition (first occurrence that carries a shape or label), find references, rename (all `idSpan`s), document highlight, and hover (the vertex's label and shape from `FlowDb`).

**Lossless CST, if wanted.** A hand-written parser can emit a flat event or green-tree stream in the rust-analyzer/rowan style: `Start(kind) / Token(i) / Finish`, with indices into the token arrays that already exist. Trivia (whitespace, comments) are only lossless if the lexer *keeps* comments rather than having `preprocess` strip them first. Pele strips them today, so v13 should lex `%%` as trivia.

Estimated cost: one `Int32Array` of events, about 1 event per token, which is O(tokens) memory. Allocations stay low because nodes are not objects until a tooling consumer asks for them. It ports to Rust 1:1 (rowan is the reference design). The usecase read-model (`usecaseTypes.ts:174-260`) shows the *useful* level for Mermaid: statement spans plus id, label and class spans per occurrence, with no full CST. Mermaid Chart's `ElementPosition` contract asks for the same thing.

---

## 5. Options

What an LSP actually needs, and what provides it:

| LSP feature | Needs | Chevrotain gives for free? | Hand-written cost |
|---|---|---|---|
| Diagnostics (several, ranged) | recovery + token positions | Recovery: yes (one flag, shown in §3.8). Ranges: token offsets yes; EOF has no position | Statement-level resync on NEWLINE/SEMI/`end` (flowchart is line-oriented) plus a bracket/mode-aware lexer reset. About 100–200 LOC per JISON-style grammar |
| Semantic highlighting | token stream with kinds + spans | yes | already there (`types/starts/texts`) |
| Folding | subgraph / statement spans | CST node locations (`nodeLocationTracking`) | a span per subgraph frame (Pele's `Frame` stack, `parser.ts:70-75`) |
| Go-to-def / refs / rename / highlight | symbol occurrence index with spans | **no**: the visitor must build it by hand (usecase did, `usecase.visitor.ts`) | +3 LOC measured (§4) |
| Hover | occurrence → model lookup | no (visitor/db work) | same |
| Completion | expected tokens at the cursor + symbol table | **yes, partly**: `parser.computeContentAssist(rule, tokens)` gives grammar-driven expected tokens | expected-sets already exist for error messages (`TEXT_TOKENS`, `fail("'SQE'…")`), but completion has to be wired per state. The real value (node ids, class names, shape names) comes from the symbol table in either design |
| Good messages | context ("opened at…", domain wording) | `ruleStack` context; messages hand-written in `errorMessageProvider` | parser stack has it; messages hand-written |

So Chevrotain's real tooling advantages come down to **generic recovery** and **content-assist expected-sets**. Positions, symbol tables, hover, rename and folding have to be built by hand in either design.

### (a) Chevrotain everywhere (core + tooling)
- **+** One grammar. Recovery and content assist come built in. Parity work is already done for flowchart: 1,587 diagrams with identical accept/reject (`mermaid-current.md` §4.2), and identical models on all 13 perf files here. Skills and docs exist (`.claude/skills/chevrotain-reference`, `migrate-diagram-to-chevrotain`).
- **−** **29.5 KB gz runtime + 8.6 KB grammar = 38 KB gz**, which is 48% of the 80 KB budget. A Pele-shaped core plus Chevrotain is about 88 KB gz (§1.1), which **breaks D10**.
- **−** It is a **runtime dependency**, which breaks D10's "0 runtime deps". Vendoring it is possible (Apache-2.0) but does not change the size.
- **−** 18 ms init per grammar and 8.7× slower parsing than Pele.
- **−** **No Rust port.** Ondine had to re-hand-write. Its `common/tokens.rs` only *imitates* Chevrotain's first-match lexer (`ondine.md` §3, recommendation 3). D3 requires Rust portability.
- Verdict: fails two hard targets (size and zero deps) and weakens D3.

### (b) Hand-written everywhere, with a position-annotated syntax layer and recovery designed in
- **+** 7 KB gz parser, 0.5 ms init, Pele/Ondine-proven parity via the jison oracle and fuzzing (`pele.md` §10, `tests/flowchart/oracle.test.ts`). Ports 1:1 to Rust (Ondine is the proof).
- **+** One parser feeds both render and tooling, so tooling can never drift from what renders.
- **+** Positions cost nothing measurable (§4). Pele already has the machinery to map positions back through preprocessing.
- **−** Recovery, expected-set and completion logic must be designed and written by hand for each grammar: about 33 grammars eventually. The TypeScript compiler and rust-analyzer do this with statement-level sync sets, and Mermaid grammars are mostly line-oriented, which makes it easier than for programming languages.
- **−** There is no grammar file to read or to generate syntax diagrams from. A grammar spec has to be kept as documentation and tests.
- Mitigation: a shared `Cursor` / `Diagnostics` / `SyntaxEvents` kit in core (about 300 LOC) that every diagram parser uses. Then recovery, positions and diagnostics are a library, not per-grammar heroics.

### (c) Hand-written runtime parser + separate Chevrotain/Langium language package for editors
- **+** The render path stays small and fast. Editors get Chevrotain recovery and content assist "for free". Editor bundles are not size-critical: Monaco is MBs.
- **−** **Two parsers per diagram type, forever**, about 33 × 2. They must agree on accept/reject *and* on semantics (what counts as a definition, how `A & B --> C` expands, shape-data YAML). The parity oracle catches accept/reject and DB-call drift (Pele's harness does exactly this). But the language package would also need its own symbol and semantic layer, which duplicates the DB.
- **−** Diagnostics would differ between the editor and the actual render, which users notice: "the editor says fine, render fails".
- **−** Mermaid Chart *already* runs this pattern: ANTLR plus jison in the fork, about 4.7 K LOC of ANTLR glue for one diagram type, behind feature flags. That is evidence of its maintenance cost rather than a model to copy.
- Verdict: workable only if the tooling layer is thin. In practice it doubles grammar maintenance.

### (d) Chevrotain grammar as the source of truth, lazy-loaded only for tooling and error paths
- Variant d1: render with a hand-written fast parser and, on error, lazy-load Chevrotain to produce rich multi-error diagnostics.
  - **−** This is still two parsers (option c), with the added risk that the fast parser rejects input that Chevrotain accepts, or the other way round, *exactly* on the error path where they matter.
  - **−** A 38 KB fetch on the first typo.
- Variant d2: generate the hand-written parser from the Chevrotain grammar.
  - **−** No such generator exists. Chevrotain grammars are TS code with embedded actions and `GATE`s (the branch uses a `GATE` for EOF and `maxLookahead:4`), not a declarative spec, so building one is a research project.
- Verdict: worst of both. It keeps two-parser maintenance and adds a load-on-error latency spike.

### Hybrid worth considering: (b) in shipped code + Chevrotain/jison as test-only oracles
- Keep jison (Mermaid 12 grammars) as the **compat oracle**, as Pele does. Optionally also keep the branch Chevrotain grammar as a second oracle for recovery and expected-set comparisons.
- Both stay devDependencies, never shipped. The parity harness already exists in two forms: Pele's `flow-oracle.ts` and the branch's `flow.db-parity.spec.ts`.
- An **editor package** (`@mermaid-js/language-service`) depends on v13 core's `parseSyntax()`, not on a second grammar:
  - It adds LSP glue (diagnostics→`Diagnostic`, occurrence index→definition/references/rename, frames→folding, tokens→semantic tokens, expected-sets + symbols→completion).
  - Monaco/CodeMirror adapters and a `vscode-languageserver` wrapper live there too.
- Zero cost to the render bundle. One grammar per diagram type.

---

## 6. Recommendation

**Choose (b): hand-written parsers in core, with positions and recovery as first-class outputs. Ship tooling as a separate package that consumes the same parser. Keep jison, and optionally the existing Chevrotain grammars, as test-only oracles.** Concretely:

1. **Core parse API returns a syntax result, never only a throw.**
   - Shape: `parseSyntax(text) → { tokens (SoA: kind/start/len, comments kept as trivia), occurrences (id → spans: def/ref/label/class), statements/frames (kind + span, nesting for folding), diagnostics[] (code, message, range {start,end} in UTF-16 of the *original* text, related ranges such as "opened here") }`.
   - `parse()` and `render()` throw the first diagnostic as a typed error with `line/column/endLine/endColumn`. Also emit a jison-compatible `hash.loc` shim, because mermaid.live (`state.svelte.ts:76-106`) and Mermaid Chart (`View.svelte:868-915`) read it today.
2. **Shared parser kit in core** (about 300 LOC):
   - A token cursor.
   - `expect()` that records a diagnostic and **resyncs** to NEWLINE/SEMI/`end`/EOF instead of throwing.
   - A diagnostics sink with error caps.
   - The preprocessing edit map (port Pele's `Edit[]` / `inputOffset`).
   - Human-level messages for the top cases in §3: unclosed bracket or string with its opening position, unclosed subgraph naming it, classDef/style/linkStyle usage hints, unknown shape with a range and suggestions.
3. **Make "0 diagnostics ⇒ identical model" the parity contract** against the jison oracle (Pele's harness plus 5k-mutation fuzz). Add a **recovery test suite**: N independent seeded errors must yield N diagnostics at the right lines. That is the §3.8 case, which Chevrotain already passes and which v13 must match.
4. **`@mermaid-js/language-service`** (milestone 2 or 3, not core):
   - LSP and Monaco/CodeMirror adapters built on `parseSyntax`.
   - It replaces the Monarch regexes and snippet-only completion in mermaid.live and Mermaid Chart.
   - It gives Mermaid Chart the `ElementPosition` mappings natively, so the fork's ANTLR parser can retire (`alana-mermaid/.../parser/antlr/`, about 4.7 K LOC).
5. **Do not ship Chevrotain in v13.** Keep the branch grammars as reference documentation and as test oracles while porting. Stop migrating new v12 diagrams to Chevrotain *for v13's sake*. For v12 it remains a reasonable jison replacement.

### Decisive facts
- **Size:** the Chevrotain runtime is 29.5 KB gz and the flowchart total is 38.0 KB gz, which is **48% of the 80 KB budget**. The Pele flowchart parser is **7.2 KB gz**. Pele core+flowchart+Chevrotain comes to **95 KB gz**, about 88 KB without Pele's own parser. That **breaks D10** and violates zero runtime deps.
- **Speed:** **18–20 ms** module init (13 ms with `skipValidations`) vs 0.5 ms. Warm parse geomean **8.7× slower than Pele** (1.6× faster than jison).
- **Rust (D3):** Chevrotain has no Rust counterpart. Ondine hand-wrote every parser and reported "No Rust parser needed a fix".
- **Tooling:** Chevrotain's only material advantages are built-in multi-error **recovery** (3/3 in §3.8; Pele and jison 1/3) and **content-assist expected-sets**. Everything else an LSP needs must be hand-built in either design: positions, symbol occurrences, hover, rename, folding and good messages. The v13 usecase Chevrotain parser builds its span model by hand in the visitor, and the Mermaid Chart fork added positions to jison by hand.
- **Positions in a hand-written parser are effectively free:** +3 LOC, +2 B gz, and no measurable time on 13 large files.
- **Today's editors** (mermaid.live, Mermaid Chart, agentflow-editor) use Monarch regex highlighting, snippet completions and **one** marker taken from jison's `error.hash.loc`. No Mermaid LSP exists. The Langium package has no LSP module. The only position-aware tooling is Mermaid Chart's code↔diagram sync, built on a forked ANTLR/jison-with-`@$` parser. The Chevrotain branch currently **drops** error positions entirely (`flow.chevrotain.ts:31-36`), which would degrade the existing markers.
