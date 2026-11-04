# ER port (#124) exploration index

Pointers only. v12 read via `git show fa796a943:packages/mermaid/src/diagrams/er/<file>` (J below). Worktree: `.claude/worktrees/int124`.

## 1. v12 ER sources (`git ls-tree`: 13 files)
`erDb.spec.js erDb.ts erDetector.ts erDiagram.ts erMarkers.js erRenderer-unified.ts erRenderer.js erRenderer.spec.ts erTypes.ts parser/{erDiagram.jison,erDiagram.spec.js,subgraph.spec.js} styles.ts`
- `erDetector.ts:9` detector is `/^\s*erDiagram/`, id `er`. `erDiagram.ts` wires parser + `new ErDB()` getter + unified renderer + styles.

### erDiagram.jison (lexer lines 1-100; `%options case-insensitive` line 3)
Start conditions (all `%x`, exclusive, lines 4-9):
- `block` (4): opens `{` L28 (returns BLOCK_START); closes `}` L43 (BLOCK_STOP). Rules L34-44: skip `\s+`, ATTRIBUTE_KEY (PK|FK|UK) L35, ATTRIBUTE_WORD for generics `~..~` L36 and plain word L37, `"..."` COMMENT L41, `.` fallback returns the char L44 (this is how `?` reaches the parser).
- `block_bq` (5): opens on backtick inside block L38, closes L40; body `[^`]+` ATTRIBUTE_WORD L39.
- `acc_title` (6): open L12 (`accTitle:`), value+pop L13. `acc_descr` (7): open L14, value+pop L15.
- `acc_descr_multiline` (8): open `accDescr {` L16, close `}` L17, body L18.
- `style` (9): opened by `style` L48 (STYLE) and `classDef` L54 (CLASSDEF); closes on newline L49 (returns NEWLINE). Rules L49-53 and L91-92 (STYLE_TEXT, SEMI). `class` L55 and `subgraph` L56 stay in INITIAL.
INITIAL rules: whitespace skip L23, NEWLINE L24, quoted names L25-26 (ENTITY_NAME excludes `% \r \n \v \b \\`; else WORD), `erDiagram` L27, BRKT/COMMA/`:::`/`:` L29-33, `[` `]` SQS/SQE L45-46, `end\b\s*` L57, direction `.*direction\s+(TB|BT|RL|LR)[^\n]*` L19-22 (note leading `.*`).
Cardinality words and symbols L58-90: ZERO_OR_ONE/ONE_OR_MORE/ZERO_OR_MORE/ONLY_ONE (words, `|o` `o|` `}o` `o{` `}|` `|{` `||` `1+` `0+` `many(0|1)`); `1` has four rules L75-78 (lookaheads decide ONLY_ONE vs ENTITY_ONE); DECIMAL_NUM L74 before NUM L79; MD_PARENT `u(?=[.\-|])` L84; IDENTIFYING `--` `to` L86-87; NON_IDENTIFYING `..` `.-` `-.` `optionally to` L85,88-90. Rule order matters (jison = first match in order, not longest).
Tail: UNICODE_TEXT L93, `.` returns char L94, EOF L95. Grammar L102+: `%left` precedence L98-99.
- Lexer actions never touch `yy`. Parser actions call `yy.addEntity/addAttributes/addRelationship/setClass/addClass/addCssStyles/setAccTitle/setAccDescription/setDirection/addSubGraph` (L124-245) and read/write `yy.subgraphDepth` (L192,196,202,208). Grammar has `title title_value` (L188) but no lexer rule emits those tokens (title comes from front matter).
- entityName L266-272 accepts ENTITY_NAME (quotes stripped), UNICODE_TEXT, NUM, DECIMAL_NUM, ENTITY_ONE. attribute grammar L274-296.

### erDb.ts (class `ErDB`, L19; `subgraphDepth` public L23 for jison)
Parser-called: `addEntity` L61 (alias, reads `getConfig().look` L69), `addAttributes` L95, `addRelationship` L120, `setDirection` L164, `addCssStyles` L182, `addClass` L209, `setClass` L303, `addSubGraph` ~L270-299, `setAccTitle/Description` (bound L51-52). Readers: `getEntities` L87, `getClasses` L91, `getRelationships` L156, `getDirection` L160, `getSubGraphs` L299, `getData` L377 (LayoutData for unified renderer), `getConfig` L467, `clear` L366. Uses `common.sanitizeText(txt, getConfig())` L351.

### Renderer / styles
- `erRenderer-unified.ts` (79 lines, the live path): `look === 'neo'` picks `*_neo` markers L30-40; handDrawn background nodes L52; edges/nodes paint-order comment L45.
- `erRenderer.js` (703 lines) + `erMarkers.js` (189): legacy renderer, check whether still referenced before porting.
- `styles.ts` (151): colour-theme gate `isColorTheme(theme, borderColorArray)` L28, `safeLook` L32, `COLOR_THEMES.has(theme)` and `erEdgeLabelBackground` L83-90, `look === 'neo'` stroke width L117,122, `[data-look=neo].labelBkg` L131.
### Specs (harvest source)
`parser/erDiagram.spec.js` 1252 lines, 125 `parse(` calls; `parser/subgraph.spec.js` 332 lines, 18; `erDb.spec.js` 130 lines (0 parse calls, DB API calls); `erRenderer.spec.ts` 12 lines.

## 2. Corpus
`e2e/diagrams/er-diagram/**/*.mmd` = 206: `visual-check/` 166, `nightly-check/` 30, `pr-check/` 10. No deeper subfolders. (`e2e/diagrams/` has per-type dirs; no ER subtype dirs beyond these.)

## 3. v13 prior art (flowchart)
- Oracle loader `packages/conformance/src/oracle.ts` (84 lines): `loadOracle` L47-52, `createRequire(...).resolve('mermaid-v12/package.json')` L54, stubs DOMPurify L58-65, `import('mermaid-v12')` L67, registers via `mermaid.parse('flowchart LR\n  A')` L69, `parse(text)` returns `{accepted, diagramType, db}` from `mermaidAPI.getDiagramFromText`.
- `packages/conformance/src/flowchart/jison-lexer.ts` (83 lines): probes `getDiagramFromText('flowchart TD\n A')` L40-41, takes `probe.parser.parser` (jison parser; `.lexer`, `.terminals_`) and `probe.db.constructor` as `FlowDB`; wraps `lexer.setInput` to capture the exact text v12 fed it (L47-52); `tokens()` re-lexes with a fresh DB as `yy`, token id 1 = `$end`, lexical error -> `['INVALID','']`. For ER: probe `'erDiagram\n A'`, `db.constructor` = ErDB; the ER lexer needs no `yy`, so passing a fresh ErDB is harmless.
- Compiled ER jison+ErDB: `/Users/knsv/repos/mermaid-v13/node_modules/.pnpm/mermaid@12.2.0/node_modules/mermaid/dist/chunks/mermaid.core/erDiagram-KYQIGQAA.mjs` (also `mermaid.esm/erDiagram-VZDIDQZ7.mjs`). Not importable directly; reach it through `getDiagramFromText` (worktree has no node_modules; run `pnpm install` or use main checkout's).
- `lexer-parity.spec.ts` (167 lines): one `describe` L135 comparing token streams over e2e fixtures + v12 spec strings (`lines` helper ~L129 splits spec text).
- `registry.ts` (17 lines): `PARITY_SUITES: ParitySuite[]` L8, entry shape `{adapter, corpusDirs, corpusFiles}` (flowchart uses `corpusFiles: ['packages/conformance/corpus/flowchart-v12-specs.json']`). Add an ER entry with `corpusDirs: ['e2e/diagrams/er-diagram']`.
- `types.ts:8` `DiagramAdapter<M>`: `id, v12Types (['er']?), detect, parse, normaliseV13, normaliseV12(db)`; flowchart's is `packages/conformance/src/flowchart/v13.ts`, v12 normaliser in `flowchart/v12.ts`.
- Package parser files `packages/diagram-flowchart/src/parser/`: `tokens.ts` (88, `T` kinds), `lexer.ts` (1074), `jison-names.ts` (85, `JISON_NAMES: Record<kind, jison terminal>` used by the parity gate), plus `detect.ts parse.spec.ts v12-lexing.spec.ts`; `src/v12-specs/` ported by `scripts/port-v12-specs.ts` (`port:v12-specs` script).
- Package shape (`packages/diagram-flowchart/package.json`): name `@mermaid-js/diagram-flowchart`, `type: module`, `sideEffects:false`, exports `.` with `mermaid-source` condition (+ `./ascii`), `files: [dist, THIRD_PARTY_NOTICES]`, scripts build/typecheck, peer+dev dep `@mermaid-js/core: workspace:^`, `"mermaid": {plugin:"diagram", id, types, formats:["svg","ascii"], export, ascii}`. `tsconfig.json` extends `../../tsconfig.json`, include `src`; `tsconfig.build.json` outDir dist, excludes specs and `v12-specs/**`.
- Checks a new package must satisfy: `tools/workspace/layout.spec.ts` (lists packages by name, add ER row), `tools/release/src/release-config.spec.ts:53` (publish list), `tools/gen-config/src/generate.ts:32` (diagram id -> package dir map, config schema), `tools/check-deps/` (`pnpm check:deps`: diagram pkg may depend only on core), `knip.json` (`packages/*` workspace glob covers entries `src/index.ts`; add ignores only if needed, e.g. `scripts/**`), cspell via `lint:spell` over `packages/**/*.ts` (add ER words, e.g. jison names, to `.cspell` config), root vitest include `packages/*/src/**/*.spec.ts` (no workspace file; `mermaid-source` condition), `packages/bench` ignoreDependencies, `check:grammar` (`tools/gen-grammar`), `pnpm-lock.yaml` update, `packages/mermaid` dependency wiring (see how `@mermaid-js/diagram-flowchart` is referenced).

## 4. ASCII goldens (D83, D100)
- D83 (`v13/docs/DECISIONS.md:145`): 179 sequence+ER goldens wait for M3; D100 (L194): M3 ASCII = sequence and ER, ER gets an `ascii` ticket (T7) porting its goldens.
- Source: `/Users/knsv/repos/mermaid-ascii/cmd/testdata/er` (70 fixtures) and `er-ascii` (13) (sibling checkout, outside worktree; research `v13/docs/research/mermaid-ascii.md:690-700`). Format "input `---` expected".
- Not yet in repo: `packages/conformance/ascii/` has only flowchart (`ascii/ extended-chars/ multibyte/`, `ascii-divergences.json`, README.md describes layout: `input.mmd`, `upstream.txt`, `expected.txt`). Harness: `packages/conformance/src/ascii/{corpus,goldens,structure}.spec.ts`, `render.ts`, `expected.ts`. No ER fixtures or references in the repo.

## Gotchas
- Jison lexer is first-match-in-order, not longest; `1` has four rules, `DECIMAL_NUM` before `NUM`, `|o`/`o|` vs words like `one`/`only one`/`optionally to`; case-insensitive option applies to all keywords (incl. `PK`, `erDiagram`).
- `direction` rule starts with `.*` so it swallows anything earlier on the line.
- `style` state exits at newline (returns NEWLINE) but `STYLE_TEXT` rule sits at L91 after INITIAL rules; INITIAL `:`/`,`/`#` rules differ from `<style>` copies.
- `<block>.` returns arbitrary single chars (how `?` and `*` leak to the parser); block accepts `*`-prefixed names.
- `yy.subgraphDepth` is parser-side state, not lexer; `title title_value` grammar path is dead.
- v12 ErDB reads `getConfig().look` in `addEntity`, so normaliseV12 may differ by look; DB text carries encodeEntities placeholders (see runs/1/INDEX.md).
- Worktree has no node_modules; oracle needs `mermaid-v12` (npm:mermaid@^12.2.0, resolved 12.2.0).
