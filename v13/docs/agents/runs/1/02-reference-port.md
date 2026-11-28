# 02 — the reference implementation: files to port

`$REF` is the reference implementation's checkout (D770).

Repo: `$REF` @ `3a2f075` ("Release: 1.13.0", 2026-10-30), clean working tree. The bench harness pins `pele@1.12.0`.
Deeper research with more line pointers: `/Users/knsv/repos/mermaid-v13/v13/docs/research/reference-implementation.md`. Read it first; this note is the port checklist.

## License and attribution
- `LICENSE`: **MIT, "Copyright (c) 2026 kepano"**. `package.json`: `"license": "MIT", "author": "kepano"`, repo `github.com/obsidianmd/pele`.
- **The reference implementation files have no per-file license headers.** They open straight with a plain `//` prose comment that says what the module does (e.g. `layered.ts:1-27` ranked aesthetic-goal list, `yaml.ts:1-2`), or with imports. DESIGN §6.2 says to **keep the ranked-goal header** of `layered.ts`.
- R-REL-4 / D-log asks for attribution. The suggested form below is an inference: add a header line such as `// Ported from Pele (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), src/layout/layered.ts @ 3a2f075.`, and add the reference implementation's MIT text to a `THIRD_PARTY_NOTICES`/`LICENSE` section of `@mermaid-js/core`.

## Conventions that clash with this repo's lint
- The reference implementation uses **`const enum`** a lot (`layout/layered.ts:29 Kind`, `layout/compound.ts:147 Style`, `text/measurer.ts:3 Style`, `diagrams/flowchart/tokens.ts:1 T`, `lexer.ts` `const enum S`). The repo's eslint `TSEnumDeclaration` ban (`/Users/knsv/repos/mermaid-v13/eslint.config.js:236-247`) also matches const enums. Convert them to `as const` objects of numbers plus a union type, or to plain `const X = 0` numbers.
- Imports use `.js` suffixes (ESM, the same style as this repo). The reference implementation has zero runtime dependencies.

## Port list (DESIGN §4–§8 → the reference implementation source)

| v13 target (ticket) | The reference implementation file | Key exports / lines | Tests to bring |
|---|---|---|---|
| YAML subset reader (#5) | `src/util/yaml.ts` (470) | `parseYaml(src)` :452; `MAX_DEPTH = 64` :12; `class Incomplete` (non-Error throw) :8; `YamlValue` type :4. Covers what js-yaml `JSON_SCHEMA` gets from Mermaid: block/flow collections, quoted/plain/block scalars. `__proto__` keys are written with `Object.defineProperty` (:15-16), so the prototype cannot be polluted (DESIGN §4.1 asks for this) | `tests/util/yaml.test.ts` (62) |
| Preprocess reference (#5) | `src/preprocess.ts` (247) | `preprocess` :138-183, `cleanupComments` :27, `normalizeLineBreaks` :34, `dropColorSemicolons` :196-234 (linear rewrite of Mermaid's backtracking regex), `encodeEntities` :237-247 | `tests/util/preprocess.test.ts` |
| Offset mapping (only if ever needed; DESIGN says no rewrites) | `src/errors.ts` (108) | `Edit` :28, `replacements` :30, `inputOffset` :45, `locate` :73 (line/col/snippet), `syntaxError` :95, `PeleError` :3 (codes `unsupported-diagram \| syntax \| semantic \| limit`) | |
| Unicode id-letter table (#6 `CharClass`) | `src/util/unicode.ts` (31) | `PACKED` base-36 RLE string :1-2, lazy `build()` → `Uint16Array` pairs, `isUnicodeLetter(code)` binary search, fast reject `< 0xaa \|\| > 0xffdc` | generator: `scripts/gen-unicode.mjs <flow.jison> <out.ts>` reads the `[ª…` block up to `return 'UNICODE_TEXT'` in flow.jison. Point it at `git show fa796a943:packages/mermaid/src/diagrams/flowchart/parser/flow.jison` |
| ASCII char classes (#6) | `src/util/chars.ts` (44) | `isSpace` :5, `isBlank` :20, `isLineEnd` :25, `isDigit`, `isLetter`, `isHex`, `isWord` :42 | |
| Flowchart lexer (#8) | `src/diagrams/flowchart/lexer.ts` (955) + `tokens.ts` (159) | `tokenize(src): {types, texts, starts}` :66 (parallel arrays :5-9); `const enum S` states copied from flow.jison :11-30; `NODE_CHAR = new Uint8Array(128)` :22; sticky `/y` regexes :27-43 (`RE_DIR`, `RE_ACC_*`, `RE_CLICK`, …); `T` enum + `TOKEN_NAMES` (`tokens.ts:1,81`) | `tests/flowchart/parser.test.ts`, `tests/flowchart/oracle.test.ts` (below) |
| Flowchart parser + db (#8 reference) | `src/diagrams/flowchart/parser.ts` (623), `db.ts` (458), `graph.ts` (271), `types.ts` (86), `shapes.ts` (109) | `parseFlowchart(source, db)` :84 (`}\s*\n` handling :81-87, done only if the source contains `}`); `FlowDb` :100 (shape errors :191-201 with Mermaid's exact messages); `buildFlowGraph` :92; shape names `shapes.ts:2-108`, `isValidShape` :102, `canonicalShape` :106 | `tests/compat/flowchart/*.spec.js` (ported v12 specs) + `adapter.ts` |
| Layered layout (#11) | `src/layout/layered.ts` (2227) | header :1-27 (keep it); `Kind` :29; `LNode` :37, `LEdge` :53, `LayeredOptions` :70-91 (`nodeSep, edgeSep, rankSep, portSep, tracks?, straight?, apart?, headRoom?, groups?, orderOnly?`), `LayeredResult` :93; `lnode` :101, `ledge(tail, head, minlen=1, labelW, labelH)` :105, **`layered(nodes, edges, opt)` :242**, `orient` :805, `rank` :845, `ease` :1059 | `tests/layout/layered.test.ts` (39) |
| Compound layout (#11) | `src/layout/compound.ts` (944) | `Dir`, `direction()` :3-8, `CNode` :10, `CEdge` :28, `CompoundResult` :40, `Style` :147, `routeCrossings` :155, `inheritCrossedDirections` :374, `shiftLayout` :389, `cnode(w,h,parent)` :404, **`compoundLayout(nodes, edges, rootDir, opt)` :419** | `tests/layout/compound.test.ts` (713) |
| `availableWidth` (#11, opt-in) | `src/diagrams/common/fit-width.ts` | `tighten`, `turnToFit` :44, `runsAcross`, `titleRoom`; used at `flowchart/render.ts:17,61` | |
| Not needed in M1 | `src/layout/lanes.ts` (swimlanes), `src/layout/components.ts` (packs disconnected parts) | | |
| Fast-path escaping (#12) | `src/svg/builder.ts` (179) | `RE_NEEDS_ESC` :8, `RE_ESC` :9, `ESC` map :10, `RE_INVALID_XML` :13, **`esc(text)` :16** (test first, replace only if needed; drops invalid XML chars), `escText` :24 (decode entities, then esc), **`num(value)` :33-49** (2-dp integer table `FRACTION`), `labelSvg` :51 (centred `<text>`/`<tspan>`, baseline shift `size*0.35` :56. DESIGN replaces this with table ascent/descent), `spanStyle` :146, `sharedStyle` :158, `textStyle` :172 | `tests/render/inert.test.ts`, `tests/support/inert.ts`, `tests/render/security.test.ts` |
| Label fast path (#10) | `src/text/label.ts` (445) | `layoutLabel(raw, markdown, measurer, size, maxWidth, base)` :311; **fast path :335-353**: `!RE_MARKUP.test(raw) && !raw.includes('&') && !raw.includes('ﬂ')` → measure once; wrap only if `width > maxWidth` and text has space / CJK / break hint (`RE_MARKUP` :33 `/[<\\\n*_]\|fa[bklrs]?:fa-/`, `RE_CJK` :67, `RE_HINT` :70, `RE_BREAK` :30); slow path `layoutMarkup` → `layoutLines` :356-405; `LINE_HEIGHT = 1.5` :26 | `tests/render/cjk-wrap.test.ts`, `break-hints.test.ts` |
| Entities (#10) | `src/text/entities.ts` (79) | ~200 named + numeric; `decodeEntities` :69, `writtenCodes` :64 | |
| Measurer (#9) | `src/text/measurer.ts` (159), `src/text/metrics.ts` (6, packed Arial table) | `TextMeasurer { width(text,size,style) }` :15, `Style` bitmask :3-10, `metricsMeasurer` :53, `canvasMeasurer` :107, `defaultMeasurer` :146, `forgetTextWidths` :157; generator `scripts/gen-metrics.mjs <regular.ttf> <bold.ttf>` (hand-parses cmap/hmtx; ASCII 95 glyphs only) | `tests/util/measurer.test.ts`, `tests/render/fonts.test.ts` |
| Alias layer (#13) | `src/svg/theme.ts` (151) `ROOT_STYLE` :6-9 (`--_bg:var(--pele-bg,#fff);--_fg…;--_m;--_l;--_s;--_a;--_b;--_c`), `FONT_MONO`, `RADIUS`; `src/svg/root.ts` (56) `svgDocument` :20-56: scans content with `RE_USED = /var\(--_(r\|tw\|hw\|w)\)/g` (:13) and writes only the used optional aliases (`WEIGHTS` :7) on the root `style` :41-49 | `tests/render/palette.test.ts` |
| Colour / contrast (#13) | `src/svg/ink.ts` (131) WCAG luminance → fg-on-light/dark; `src/svg/theme.ts` `resolveStyle` :99 (style filtering), `classNames` :140 (`[\w-]` reduction) | `tests/render/ink.test.ts` |
| URL safety (#12) | `src/util/url.ts` (130) | see 01-v12-reference.md | `tests/util/url.test.ts` |
| Shapes/edges/cluster (#14 reference) | `src/svg/shapes.ts` (689, `insetRoute` :678-689), `src/svg/edges.ts` (549, `routePath` :46-60), `src/svg/cluster.ts` (72), `src/diagrams/flowchart/render.ts` (371, `renderFlowchart` :60) | | `tests/render/flowchart.test.ts`, `edges.test.ts` |
| Stress / limits (#17) | — | | `tests/stress.test.ts` (105: 50k-char runs, 1000-deep subgraphs, unclosed directives) |

## Fuzz corpus support (`tests/support/corpus.ts`, 59 lines). Port to conformance/#17
- `loadCorpus(diagram, keyword)`: collects every string literal (backtick, single or double quoted) in `tests/compat/<diagram>/*.spec.[jt]s` that matches `keyword`, evaluates escapes with `new Function('return `…`')`, and adds `tests/corpus/<diagram>-docs.json`.
- `random(seed)`: LCG `state = imul(state,1664525)+1013904223`.
- `mutator(corpus, fragments, rnd)`: 1–3 edits per sample. Each edit is one of: insert a fragment (35%), delete 1–3 chars (25%), splice ≤20 chars from another corpus entry (15%), duplicate ≤6 chars (15%), or replace a char with a fragment (10%).
- Use: `tests/flowchart/oracle.test.ts`. It has a `FRAGMENTS` list of ~130 flowchart tokens, `corpus.length > 300`, and `FUZZ` env (default 5000 mutated inputs). It compares **tokens, accept/reject and model calls** against the oracle.

## The reference implementation's own oracle: an alternative that needs no DOM (relevant to #4 / #8)
- `tests/support/jison.ts`: `buildParser(grammarPath)` builds the parser in-process with the `jison` npm package (`new jison.Generator(grammar, {moduleType:'js','token-stack':true})`).
- `tests/support/oracle.ts`: `createOracle(grammarPath)` → `{parser, methods (yy.* names scraped from grammar), tokens(src, yy), parse(src, yy)}`; `recordingYy` records every `yy.*` call; `mergeTokens`.
- `tests/support/flow-oracle.ts`: vendored grammar `tests/compat/flowchart/upstream/flow.jison`; `prepare()` = the `}\s*\n` rewrite; `oracleTokens/peleTokens`, `oracleParse/peleParse` (`destructLink` stubbed, `addSubGraph` returns `SG<n>`).
- `scripts/sync-specs.mjs <mermaid checkout at tag> [suite]` copies v12 specs into `tests/compat/<type>/`, rewrites imports to an adapter, vendors grammars into `upstream/`, and writes `SKIPPED.md` (suite descriptors in `scripts/suites/*.mjs`). Flowchart adapter: `tests/compat/flowchart/adapter.ts` (exposes `FlowDB`/`setConfig`/`log` with v12 names over the reference implementation's `FlowDb`). Flowchart skips (`tests/compat/flowchart/SKIPPED.md`): only 2, one of which is DOMPurify's `<`→`&lt;` serialisation.

## Bench fixtures (the "#8635 / the reference implementation set", R-PERF-6)
`scripts/bench-mermaid.mjs:29-80`. These are the fixtures #8635 used ("the ones the reference implementation uses in its Mermaid comparison"):
- `tree(n)`: `flowchart TD` + `n{floor((i-1)/3)}[Node …] --> n{i}[Node i]` for i < n (fan-out 3). Used for **50** and **500** nodes.
- 7-node flowchart (Start / Is it working? / Ship it / Debug / Fix / Celebrate / Done), a `sequenceDiagram` (Alice/Bob, loop), and a `classDiagram` (Animal/Dog/Cat/Bird).
- Plus `tests/corpus/flowchart-docs.json`. `scripts/bench.mjs` adds `mesh(n, extra)` random graphs (seeded LCG).
- Copy the fixture strings literally into `packages/bench/fixtures/`.
