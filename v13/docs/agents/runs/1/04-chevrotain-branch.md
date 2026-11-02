# 04 — The Chevrotain flowchart branch (oracle/normaliser prior art)

**Location: repo `/Users/knsv/repos/mermaid`, local branch `flowchart-chevrotain-parser` @ `700df567e`** (2026-08-07, "[autofix.ci] apply automated fixes"). It also exists as `origin/flowchart-chevrotain-parser` and is not merged into `origin/develop`. It pins `chevrotain ~11.1.2` in `packages/mermaid/package.json`.
This is the same ref `v13/docs/research/parser-and-tooling.md:13` names. Unrelated older branches with "chevrotain" in the name: `flowchart-chevrotain` @ `ff6bc3b37` (2025-06, `flow-chev-*.spec.js`, a different experiment), `filipsajdak/flowchart-chevrotain`, `sidv/chevrotain`, `pie-`/`state-chevrotain-parser`, `chore/8116_kanban-chevrotain`.
A copy of the branch parser (unchanged except recovery/skipValidations variants), with benches, is in the **gitignored** `/Users/knsv/repos/mermaid-v13/.tmp/parser-research/` (`chev/`, `c13/`, `jison/`, `pele-spans/`, `bench.mjs`, `errors.mjs`, …). It is untracked, so ticket #2's deletion of v12 sources should leave it in place (inference: `.gitignore:81` has `.tmp`).

Read files with `git -C /Users/knsv/repos/mermaid show flowchart-chevrotain-parser:<path>`.

## Files (`packages/mermaid/src/diagrams/flowchart/parser/`)
| File | Lines | What |
|---|---|---|
| `flow.tokens.ts` | 692 | `createToken` set. Abstract categories `Link, StartLink, EdgeText, TextToken, Pipe, ShapeData` (`Lexer.NA`, :28-33); `NodeString` :42, `UnicodeText` :48, `NewLine` :58, `Space` :69, `AccTitle/AccDescr/AccDescrMultiline` :80-88, `MdStringStart/MdString/MdStringEnd` :99-108, `StringStart/StringContent/StringEnd` :116-125, keywords `Style, Default, LinkStyle, Interpolate, ClassDef, Class, Href, Call…` :140-169. Token-level reference for the v13 lexer (DESIGN §4.3) |
| `flow.lexer.ts` | 154 | `flowLexer = new Lexer({ defaultMode: 'default', modes: {…} })` :33. Modes mirror jison start conditions |
| `flow.lexer.spec.ts` | 216 | **Lexer-parity gate**: jison lexer is the oracle; asserts identical `(terminal name, image)` streams. Documented deviations: `accTitle:`/`accDescr:` (jison emits an empty-image value token) and `@{` SHAPE_DATA opener (empty image). Same idea as Pele's `oracleTokens` |
| `flow.parser.ts` | 736 | CstParser grammar |
| `flow.visitor.ts` | 526 | CST → `FlowDB` calls (reproduces jison actions) |
| `flow.chevrotain.ts` | 38 | `parseFlowchartChevrotain(input, yy: FlowDB)`. Appends `\n`, reports whichever of lex/parse error comes first (restores jison first-error order). Errors are plain `Error` **with no position** (regression noted in parser-and-tooling.md:105) |
| `flowParser.ts` | 69 | engine switch on internal `config.parser.flowchart` (`'chevrotain'` default, `'legacy'`). `parser.parse` (no `}\n` rewrite) vs default `parse` (applies `}\s*\n`→`}\n`) |
| `flow.parser.spec.ts` | 84 | |
| `flow.parse-corpus.spec.ts` | 120 | **`PARSE_FIXTURE_PATH` runner** (below) |
| `flow.db-parity.spec.ts` | 146 | **DB-parity gate with `snapshotVertex`/`snapshotEdge`** (below) |
| plus the 15 v12 `*.spec.js` and `flow.jison` | | |
Fixture corpus used by db-parity: `cypress/platform/dev-diagrams/parser-update/flowchart/flowchart-01-basic … flowchart-12-graph-comments.mmd` (12 `.mmd` + README) on the same branch.

## `flow.parse-corpus.spec.ts` (the pattern for #4 `PARSE_FIXTURE_PATH` mode)
- `const FIXTURE_PATH = process.env.PARSE_FIXTURE_PATH`; `describe.skipIf(!FIXTURE_PATH)` keeps it out of the normal suite.
- `findMmdFiles(dir)`: recursive `.mmd` walk.
- `preprocess(raw) = encodeEntities(preprocessDiagram(raw).code) + '\n'`. **This mirrors the production parse path**: front matter, directives and comments are stripped and entities encoded. Note that in this repo's tree, `preprocessDiagram(...).code` is an object `{raw, cleaned, withComments, frontmatterLineOffset}` (`packages/mermaid/src/preprocess.ts:58,82-87`), so use `.code.cleaned`. That is an inference from the API difference between the branch and fa796a943.
- `parseLegacy`: `flowJisonParser.parser.yy = new FlowDB(); yy.clear(); parse(text.replace(/}\s*\n/g, '}\n'))`.
- Classifies each file as bothOk / bothFail / improvement (new OK, legacy fail) / **regression (legacy OK, new fail)** / preprocessErrors; yields to the event loop every 50 files (`setImmediate`); prints a summary; `expect(regressions).toEqual([])`; timeout 600 s.
- Usage: `PARSE_FIXTURE_PATH=/path/to/mmd pnpm vitest run flow.parse-corpus.spec.ts`.

## `flow.db-parity.spec.ts` (the normaliser shape DESIGN §13.1 adopts)
```ts
snapshotVertex(v) = { id, text, type, labelType, styles, classes, link, linkTarget, props, dir }
snapshotEdge(e)   = { start, end, type, stroke, length, text, labelType, id, classes, style, interpolate }
snapshot(db) = {
  direction: db.getDirection(),
  vertices: [...db.getVertices().values()].map(snapshotVertex).sort(by id),
  edges: db.getEdges().map(snapshotEdge),                       // order kept
  classes: [...db.getClasses().values()].map(c => ({ id, styles, textStyles })),
  subGraphs: db.getSubGraphs().map(s => ({ id, title, nodes: [...s.nodes].sort(), dir, classes })),
  tooltips: vertices.map(v => [v.id, db.getTooltip(v.id)]).filter(defined),
}
```
(lines 18-70). Note what it leaves out: accTitle/accDescr/title, click callbacks (`funs`), `edges.defaultInterpolate/defaultStyle`, vertex `domId`, subgraph `labelType`. Decide in #8 whether the v13 normaliser adds these (R-COMPAT-6 needs acc*).
- Corpus `harvest()` (:87-115): regex over sibling `*.spec.js` for `.parse('…')` / ``.parse(`…`)`` literals. Unescapes `\n \t \r \` \' \\`, skips template literals with `${` and inputs containing `%%`; keeps only inputs that jison accepts; asserts `CORPUS.length > 80`.
- `it.each(CORPUS)` → `expect(chevrotainSnapshot(input)).toEqual(jisonSnapshot(input))`, plus a second suite over the `.mmd` fixture dir (comments stripped with `cleanupComments`).
- To compare against v13's FlowModel, write a v13 → same-shape adapter and keep these field names. DESIGN says "the normaliser for flowchart is literally its snapshotVertex/snapshotEdge shape".
