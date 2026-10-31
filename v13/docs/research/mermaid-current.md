# Mermaid today: anatomy for the v13 redesign

Scope: `/Users/knsv/repos/mermaid-v13` (develop @ 6e588f8e5, private fork that will become v13) and
`/Users/knsv/repos/mermaid` (branch `flowchart-chevrotain-parser`). All paths below are relative to
`/Users/knsv/repos/mermaid-v13` unless prefixed with `mermaid:` (the sibling repo).
Benchmark context: `/Users/knsv/repos/mermaid-v13-approches/README.md` and
`/Users/knsv/repos/mermaid-v13-approches/reports/2026-10-30-mermaid-dagre.md`.

Note: parts of CLAUDE.md are out of date. Lodash has been replaced by `es-toolkit`. Chevrotain is
already a direct dependency (`~13.2.0`). There is one flowchart detector/renderer pair plus an ELK
detector (not "3 versions"). class/state have only `-V2` detectors. ELK layout now also lives in-tree.

---

## 0. Headline numbers (benchmark, mermaid@12.2.0, 158 flowcharts, Chromium, M4 Max)

From `/Users/knsv/repos/mermaid-v13-approches/reports/2026-10-30-mermaid-dagre.md`:

| | Mermaid 12.2 | Pele (TS, 0 deps) | Ondine (Rust/WASM) |
|---|---|---|---|
| Loaded for a flowchart | 796 KB / 213 KB gz | 156 KB / 62 KB gz | 8 KB JS + 310 KB WASM |
| Distributable | 4.85 MB / 1.39 MB gz | 156 KB | 318 KB |
| Σ warm render (153 common) | 8528 ms | 138 ms | 146 ms |
| Geomean speed vs Mermaid | 1× | 118× | 104× |
| Direct / transitive deps | 23 / 86 | 0 / 0 | 1 / 26 |
| SVGs with `<foreignObject>` | 147/158 | 0 | 0 |
| SVGs with `<style>` | 158/158 | 0 | 0 |

Large graphs: `perf/huge2` (1708 lines) takes 2899 ms in Mermaid and 40 ms in Pele, and
`perf/medium3` (564 lines) takes 1120 ms and 12 ms. Mermaid's cost is not in parsing. It comes from DOM
measurement, layout and serialization (§2).

---

## 1. Size anatomy

### 1.1 Runtime dependencies (`packages/mermaid/package.json`, `"dependencies"`)

| Dep | Why it is there | Approx. cost (min / gz) | Plain flowchart? |
|---|---|---|---|
| `d3` ^7.9 (full meta-package) | DOM selection/creation everywhere (`select`, `.append`, `.attr`), shapes/curves for edges, scales/axes for gantt/xychart, transitions for tooltips | d3 chunk ≈120 KB min (d3-shape, -selection, -transition, -time-format, -brush, -color, -scale, -time): `chunk-L2B47AAZ` | **Yes** (core) |
| `dagre-d3-es` 7.0.14 | Dagre layered layout + graphlib (ESM fork of dagre-d3). Default flowchart/class/state/ER layout | ≈40 KB (`dagre-*.mjs`) + ≈42 KB (`chunk-D36F7FYG`: still drags in **lodash-es** via dagre-d3-es) | **Yes** (lazy, but always for flowchart) |
| `elkjs` ^0.12 | ELK layered/force/etc. layouts (`layout: elk`), loaded on demand from `src/rendering-util/render.ts:66` | **1.62 MB min / 507 KB gz** (`elk-*.mjs`), the single biggest chunk | No (only with `layout: elk*`) |
| `cytoscape` ^3.34, `cytoscape-cose-bilkent`, `cytoscape-fcose` | Force layouts for mindmap (`cose-bilkent`), architecture (`fcose`) | 470 KB min / 150 KB gz (`chunk-PKJCTQEK`) + plugins | No |
| `katex` ^0.18 | `$$…$$` math in labels, via dynamic `import('katex')` in `src/diagrams/common/common.ts:336` | 273 KB min / 79 KB gz | No (only when label contains `$$`) |
| `dompurify` ^3.4.17 | HTML sanitization of every label + final SVG (§7) | ≈124 KB source → ~22 KB gz; sits in core chunk `chunk-FWWDAFD2` | **Yes** (core) |
| `khroma` ^2.1 | Color math for themes (`darken`, `lighten`, `adjust`, `invert`, `rgba`, `isDark`) | ≈24 KB source, small | **Yes** (core, themes) |
| `marked` ^16.3 | Markdown strings (`` "`**bold**`" ``) → tokens/HTML in `src/rendering-util/handle-markdown-text.ts` | ≈95 KB source → ~35 KB min (`chunk-XGFVAD2T`) | **Yes** (core, statically imported by createText) |
| `roughjs` ^4.6 | `look: handDrawn`. Imported statically by **81 files** (every shape, `edges.js`, clusters) | ≈28 KB min (`chunk-F6PIGZHG`) | **Yes**, even if handDrawn is unused |
| `stylis` ^4.3 | CSS compile + namespacing of the per-SVG `<style>` (`src/mermaidAPI.ts:233`) | small (~10 KB) | **Yes** |
| `chevrotain` ~13.2 | New in-tree parsers (usecase today, pie/flowchart on the sibling branch) | ~150–200 KB min if bundled standalone | Not today in v13. Yes once the flowchart parser migrates |
| `@mermaid-js/parser` (workspace) → `langium` + `chevrotain` | Langium parsers for architecture, gitGraph, info, packet, pie, radar, treemap, treeView, wardley, cynefin, eventmodeling, railroad×4 | **659 KB min / 136 KB gz** (`chunk-WLHZKB66` = `mermaid-parser.core`) | No (lazy, per-diagram) |
| `dayjs` | Gantt date math. **Also imported by `src/logger.ts:5`** for timestamps, so it is in core | ~7 KB | **Yes** (via logger) |
| `@iconify/utils` (+`@iconify/types`) | Icon packs (`registerIconPacks`), `fa:fa-x` replacement in labels, architecture/treeView icons. `src/rendering-util/icons.ts` | ~15–20 KB | **Yes** (createText imports icons.ts) |
| `@braintree/sanitize-url` | `click … href` URL sanitizing (`src/utils.ts:255`) | tiny | Yes |
| `es-toolkit` | Lodash replacement (merge, memoize, etc.) | ≈26 KB source in `chunk-GHI2JMQX` | Yes |
| `d3-sankey` | Sankey layout | small | No |
| `@upsetjs/venn.js` | Venn layout | small | No |
| `uuid` | IDs in mindmap/ER | tiny | No |
| `ts-dedent`, `@types/d3` | Dedent in source / leaked type dep | ~0 | — |

**Undeclared, but bundled:**
- `js-yaml` is a *root* devDependency (`package.json:154`). It is imported by `src/diagram-api/frontmatter.ts`, `flowDb.ts`, `sequenceDb.ts`, `kanbanDb.ts` and `agentflowDb.ts`, and is bundled into core (`chunk-GDOATIN3`, 47 KB min).
- `fastdom` 1.0.12 is a devDependency of the mermaid package but is imported at runtime in `src/rendering-util/fastdom.ts`, so it is bundled.

### 1.2 What a plain flowchart actually loads (12.2 esm.min dist, measured from chunk import graph)

- **Core (static imports of `mermaid.esm.min.mjs`): 18 files, 693 KB min / 175 KB gz.**
  - `chunk-FWWDAFD2` 244 KB: all 11 themes (≈248 KB source in `src/themes/`), DOMPurify, khroma, the config schema defaults, diagram-api
  - `chunk-L2B47AAZ` 120 KB: d3
  - `chunk-KJ5T2YZX` 116 KB: **all 113 shape files** (`src/rendering-util/rendering-elements/shapes/`, ≈10k LOC), eagerly loaded
  - `chunk-XGFVAD2T` 50 KB: marked + createText + profiler + fastdom
  - `chunk-GDOATIN3` 47 KB: js-yaml
  - `chunk-XUG7IRDC` 38 KB: edges.js + markers.js
  - `chunk-F6PIGZHG` 28 KB: roughjs
  - `chunk-GHI2JMQX` 19 KB: utils + es-toolkit
- **+ flowchart: 9 more files, ≈160 KB**, for a total of 853 KB min / 231 KB gz.
  - `chunk-7P5HNUOW` 64 KB: generated `flow.jison` (≈60 KB source) + flowDb (1422 LOC) + styles
  - `chunk-D36F7FYG` 42 KB: lodash-es via dagre-d3-es
  - `dagre-*` 40 KB
  - `chunk-KTS5TP6K` 10 KB: graphlib wrapper, common layout, createGraph

The flowchart path therefore pays for:
- every theme
- every shape
- roughjs, marked, js-yaml, DOMPurify and d3-brush/d3-time-format
- the jison table parser

None of these is needed to draw boxes and arrows. Distributable total is 4.85 MB min, dominated by ELK (1.6 MB), langium (0.66 MB), cytoscape (0.47 MB) and katex (0.27 MB).

Builds: `.esbuild/build.ts` produces ESM (lazy chunks), IIFE `mermaid.min.js` (5.5 MB, everything inlined) and
`mermaid.core.mjs` (deps external). `packages/tiny` is a no-lazy-load CDN variant that drops mindmap/architecture.

---

## 2. Speed anatomy: where a flowchart render's time goes

Pipeline entry: `src/mermaidAPI.ts` `renderDiagram()` (≈L480–690). Built-in profiler: `src/profiler.ts`
(342 LOC; spans `parse`, `draw`, `measure`, `paint`, `serialize`, `getBBox` ticks). It is wired through `injected.profiling`
and compiled away in production.

1. **Preprocess** (`src/preprocess.ts`). Steps, in order:
   - CRLF normalization, plus a regex rewrite of `<tag a="b">` quoting
   - frontmatter (js-yaml)
   - `%%{init}%%` directives (`utils.detectInit`)
   - comment stripping (`diagram-api/comments.ts`)
   - `detectType`, which runs the regex detectors from `diagram-api/regexes.ts`

   Everything is regex-based and runs before parsing. On the sibling branch, `mermaid:` commit 865b75b538 fixed an O(n²) comment regex that cost
   ~250 ms on indented input.
2. **Config reset + merge** (`config.ts` `updateCurrentConfig`). Every render runs a deep `assignWithDepth` over the
   ~570-key config. If the theme is overridden, theme variables are recomputed (`getThemeVariables`, ~250 khroma
   derivations).
3. **Parse** (`Diagram.fromText`): lazy-load the diagram, then run the jison LALR table parser into `FlowDB`. FlowDB applies
   `sanitizeText` to every label, which calls **DOMPurify per label** (`diagrams/common/common.ts:85`), plus YAML for `@{}`.
4. **DOM scaffold**: append a hidden `<div><svg><g>` to `document.body` (or into a sandbox iframe).
5. **Style compile** (`createUserStyles`, `mermaidAPI.ts:323`):
   - `createCssStyles` builds classDef rules through a **`new CSSStyleSheet()`**, which requires a browser
   - the diagram `styles.ts` template string is generated from themeVariables
   - `getStyles` wraps it in common CSS
   - **stylis** `compile → middleware(namespace) → serialize`

   The result is injected as `<style>`. This runs once per render, with no caching across renders.
6. **Draw** (`flowRenderer-v3-unified.ts`, 57 LOC): `db.getData()` → `LayoutData` → `rendering-util/render.ts` →
   lazy layout loader → `layout-algorithms/common/index.ts` `createCommonLayoutRenderer`:
   - **measure** (`dagre/index.js` `measureDagreGraph`, L259):
     - for every node, `insertNode` builds the real SVG shape and its label in the live DOM
     - labels go through `createText`: HTML labels = `<foreignObject><div><span>` measured with
       `getBoundingClientRect()`, done as `fastdom.measure` batches on a microtask (`src/rendering-util/fastdom.ts`, from upstream perf PR #7951)
     - a second layout pass runs if the text hits the wrap width (`createText.ts:73–80`)
     - shapes then call `getBBox()` on label groups (`shapes/util.ts` `labelHelper`)
     - edge labels are inserted and measured the same way
     - nodes and edges go through `Promise.all` (L293, L416), so DOM writes and reads are batched, but each label is still a real
       layout/reflow participant

     About 210 `getBBox`/`getBoundingClientRect` call sites exist across src, ~13 in shapes alone.
   - **layout**: `dagreLayout(graph)` (`dagre-d3-es`, synchronous JS). Clusters cause *recursive* sub-graph
     renders (`mermaid-graphlib.js`, 472 LOC, extracts clusters into nested graphs).
   - **paint** (`applyDagreLayoutResult` L504): set `transform` on each node, `insertCluster`, `insertEdge`
     (d3 curve, intersection math in `rendering-elements/intersect/`, markers, optional line jumps
     `lineJump.ts` 759 LOC, step-animation), then `positionEdgeLabel`.
   - `setupViewPortForSVG` → a final `getBBox()` on the whole SVG for the viewBox.
7. **Serialize** (`serializeSvg`, `mermaidAPI.ts:636`):
   - set `xmlns` on foreignObject children
   - `innerHTML` of the enclosing div
   - `cleanUpSvgCode` regexes
   - **`DOMPurify.sanitize(wholeSvg, {ADD_TAGS:['foreignobject'], HTML_INTEGRATION_POINTS})`** unless `securityLevel: loose`, which reparses the entire SVG string. This is significant for large diagrams; the code comment says it "can dominate for very large diagrams".
   - sandbox mode instead base64-encodes the SVG into an `<iframe src=data:…>`.
8. The caller inserts the returned string into the page, which means a second parse and layout by the browser.

Structural speed problems for v13:
- (a) Text measurement requires a live DOM and layout engine. No headless or
  worker rendering is possible, and jsdom gives wrong sizes (the `canvas` devDep is used only in tests).
- (b) Strictly phased insert → measure → layout → paint, with real DOM nodes created twice in effect (measured, then serialized and re-parsed by the host).
- (c) Sanitization happens twice: per label and on the whole SVG.
- (d) Config deep-merge, theme recompute and stylis run on every render.
- (e) Dagre/graphlib is generic and object-heavy, and cluster handling recurses.

Layout engines: `rendering-util/layout-algorithms/`:

| Engine | LOC | Note |
|---|---|---|
| `dagre/` | 1291 | |
| `elk/` | 3898 | in-tree, plus `packages/mermaid-layout-elk` |
| `cose-bilkent/` | 549 | cytoscape |
| `grid/` | 7839 | orthogonal router |
| `swimlanes/` | 13148 | custom 4-phase Sugiyama-like |
| `layout-utils/` | 2567 | validateLayout/scoreLayout |
| `ddlt/` | 1099 | DOM-decoupled layout tests with captured sizes |

DDLT already proves that layout can run on pre-captured sizes without a DOM.

---

## 3. Labels

Entry points:
- `src/rendering-util/createText.ts` (419 LOC), the modern path used by all `rendering-util` shapes
- `src/rendering-util/rendering-elements/createLabel.js`, the legacy path
- `src/rendering-util/rendering-elements/shapes/util.ts` `labelHelper` (413 LOC)
- `src/diagrams/common/common.ts` (393 LOC: sanitize, `<br>` handling, KaTeX)
- `src/rendering-util/handle-markdown-text.ts` (147 LOC, marked)
- `src/rendering-util/splitText.ts` (135 LOC, wrapping)
- `src/rendering-util/icons.ts` (108 LOC)

- **Switch:** `getEffectiveHtmlLabels(config)` (`config.ts:352`) uses `htmlLabels ?? flowchart.htmlLabels ?? true`,
  and the per-diagram key is deprecated. It has 38 call sites. Default is **HTML labels**.
- **HTML path** (`createText` `useHtmlLabels=true`):
  - `markdownToHTML` (marked lexer → limited HTML: strong/em/br, unsupported tokens fall back to raw)
    or `nonMarkdownToHTML`
  - `replaceIconSubstring`: regex `(fa[bklrs]?):fa-([\w-]+)` → async `getIconSVG` from registered Iconify packs
    (otherwise `<i class=…>`)
  - `addHtmlSpan`: `<foreignObject>` → `<div style="display:table-cell; white-space:nowrap; max-width:W">` →
    `<span class="nodeLabel">`, with `span.html(sanitizedLabel)` (raw HTML insertion after DOMPurify)
  - measure, and if width == max, switch to `display:table; white-space:break-spaces` so the **browser** does the wrapping
  - styles are translated `fill:`→`color:`
- **SVG path** (`useHtmlLabels=false`):
  - `markdownToLines` produces a structured list of words with bold/italic per line
  - `createFormattedText` → `<text><tspan>`
  - wrapping is **done by Mermaid**: `splitLineToFitWidth` recursively tries word (then grapheme) splits, calling
    `computeWidthOfText` (a DOM `getBBox`/`getComputedTextLength`) for each candidate. That is O(words) DOM measures per
    line.
  - an optional background rect
- **KaTeX:**
  - `$$…$$` detected by `katexRegex` (`common.ts:295`)
  - dynamic import of katex, rendering to MathML (or HTML with `legacyMathML`/`forceLegacyMathML`)
  - sanitized after CVE-2025-54881
  - only works in the HTML path, because it needs foreignObject
  - `calculateMathMLDimensions` measures by mounting a temp div
- **Markdown strings:** `` "`…`" `` in the grammar produce `labelType: 'markdown'`. `markdownAutoWrap` is a config key.
- **Entities / `<br>`:** `decodeEntities`/`encodeEntities` (`utils.ts`, `mermaidAPI.ts`) and `lineBreakRegex`
  (`common.ts:8`), duplicated in several places. Multiple `<br>` normalizations exist between createText and createLabel.
- **Complexity hot spots:**
  - the dual path roughly doubles every label-related bug surface
  - foreignObject output is not portable (it breaks in non-browser SVG consumers, PDF export and Inkscape), and it is 147/158 of the benchmark outputs
  - class diagrams have their own label/measure code (`diagrams/class` 4 measurement sites)
  - sequence uses `utils.calculateTextWidth` / `wrapLabel` (DOM-based)
  - several other diagrams roll their own

---

## 4. Parsing

### 4.1 Parser tech per diagram (v13 develop)

| Tech | Diagrams |
|---|---|
| **jison** (19 grammars, 5013 LOC total) | flowchart (646), agentflow (673; a near-copy of flow's lexer, see `diagrams/agentflow/NOTES.md`), class (440), sequence (423), state (352), er (336), c4 (322), block (293), requirement (267), quadrant (189), gantt (188), xychart (177), kanban (166), venn (135), mindmap (127), timeline (87), journey (69), sankey (67), ishikawa (56) |
| **langium** (`packages/parser/src/language/*.langium`, 17 grammar files, 1168 LOC) | architecture, gitGraph, info, packet, pie, radar, treemap, treeView, wardley, cynefin, eventmodeling, railroad (+ railroad-abnf/-ebnf/-peg). Shared `common.langium` (title/accTitle/accDescr) |
| **Chevrotain** (hand-written, co-located) | **usecase**: `src/diagrams/usecase/parser/usecase.{tokens,lexer,parser,visitor}.ts`; shared `src/diagrams/common/parser/runChevrotainParse.ts`. This is the reference implementation for the skills |
| reuse | swimlanes reuses flowchart parser/DB/renderer via `createFlowDiagram` (`diagrams/swimlanes/swimlanesDiagram.ts`, the one sanctioned cross-diagram import) |
| none | error, info (trivial) |
| external | zenuml (`packages/mermaid-zenuml`, uses `@zenuml/core`) |

All parsers write into a mutable DB through a `yy` object or a module-level singleton (`ParserDefinition` in
`src/diagram-api/types.ts`). None produce a reusable AST except usecase's source-span read-model
(`diagrams/usecase/usecaseAst.ts`).

### 4.2 Chevrotain flowchart parser (sibling repo)

- `git -C /Users/knsv/repos/mermaid branch --show-current` → **`flowchart-chevrotain-parser`**
- `git log --oneline -15` (top):
  - `700df567e [autofix.ci]`
  - `a8248805e Merge origin/develop`
  - `bb1c1c917 fix: align flowchart swimlane beta keyword`
  - then upstream merges (#8028 pin langium/chevrotain node20, #7951 fastdom reflow batching, v11.16.1)
- Branch-only commits (`develop..HEAD`):
  - `3889fe57d9 Migrate pie chart parser to Chevrotain`
  - `5569dd20f2 Add shared parser infra + parity gate`
  - `9daffb8fc2 Migrate flowchart parser to Chevrotain`
  - `84b849881b Match whitespace runs in SPACE token`
  - `865b75b538 Guard anyCommentRegex against O(n²)`
  - Diff vs develop: 78 files, +7121/−3237.

Files (`mermaid:packages/mermaid/src/diagrams/flowchart/parser/`):

| File | LOC | Role |
|---|---|---|
| `flow.tokens.ts` | 692 | 108 `createToken`s. Terminal names mirror jison (`SQE`, `PS`, `STR`…) so error messages match. Token **categories** (`Lexer.NA` parents) for terminals jison emits from several rules (LINK, EDGE_TEXT, TEXT). Push/pop variants. |
| `flow.lexer.ts` | 154 | **Multi-mode lexer** mirroring jison's 18–20 start conditions. First-match ordering (keywords with trailing `\b`, `#&*` before NODE_STRING). `universalOpeners` array emulates jison `<*>` rules. |
| `flow.parser.ts` | 736 | `CstParser`, **52 rules**, `maxLookahead: 4`, custom `errorMessageProvider` producing jison-style `Expecting 'X' got 'Y'`. Left recursion → `MANY`/`AT_LEAST_ONE`; shared prefixes factored; trapezoid/lean merged and disambiguated in the visitor. EOF handled by a `GATE` alternative. Singleton instance. |
| `flow.visitor.ts` | 526 | **CST + visitor (no embedded actions)**. `getBaseCstVisitorConstructor()` (strict). Writes into `this.yy: FlowDB` using the same calls the jison actions made: `addVertex`, `addLink`, `destructLink`, `addSubGraph`, `addClass`, `setClass`, `setClickEvent`, `setLink`, `setTooltip`, `setDirection`, `updateLink`, `updateLinkInterpolate`, `setAccTitle/Description`. Raw token images pass through and FlowDB sanitizes. Handles `@{}` shape data (despite a stale header comment). |
| `flow.chevrotain.ts` | 38 | Entry `parseFlowchartChevrotain(input, yy)`: append `\n`, tokenize, parse, then report whichever of lex/parse error is *positionally first* (restores jison's first-error semantics), then visit. |
| `flowParser.ts` | 69 | Dispatcher. Reads internal `config.parser.flowchart ?? parser.default ?? 'chevrotain'` **per parse()**. Keeps the `parser.yy` + `parser.parse` surface. Legacy `flow.jison` is retained (deprecated) for rollback. |
| `common/parser/runChevrotainParse.ts`, `commonTokens.ts`, `commonExtract.ts`, `parserTestUtils.ts` | 38/42/87/91 | Shared pipeline; `describeForEachParserEngine`. |

Total new flowchart parser code is ≈2,215 LOC versus 642 LOC of jison grammar. Schema change: an INTERNAL `parser` map
(`legacy|chevrotain`) in `config.schema.yaml`, added to `secure` so directives can't flip engines.

**Test parity approach** (layered):
1. **All 15 pre-existing spec files** were rewritten to `describeForEachParserEngine('flowchart', …)`, so every assertion runs on both engines and the assertions themselves are unchanged.
2. `flow.lexer.spec.ts` (216): **token-for-token** name+image comparison against jison's lexer over curated plus spec-harvested inputs. SPACE runs are collapsed because Chevrotain matches whitespace runs.
3. `flow.parser.spec.ts` (84): acceptance parity.
4. `flow.db-parity.spec.ts` (146): harvests every `parse('…')` literal from the `*.spec.js` files and every `.mmd` in a fixture dir, parses with both engines into separate FlowDBs and deep-compares a projection (vertices, edges, classes, subgraphs, …).
5. `flow.parse-corpus.spec.ts` (120): opt-in `PARSE_FIXTURE_PATH=<dir>` differential run. The commit message reports **1,587 real-world diagrams, with identical accept/reject on every file**.

**Perf numbers:** no systematic parse benchmark is committed. The only numbers are in commit messages:
- 84b849881b: a 50-line × 1600-space flowchart now parses in **~10 ms** (it was O(n²) from single-char SPACE tokens)
- 865b75b538: the comment regex fix saved **~250 ms** on deeply-indented input

Parse time is a small share of total render time (§0), so the case for the migration rests on
maintainability, error messages, the AST/read-model and dropping jison codegen, not on render speed.

**Standalone?** Mostly yes:
- tokens, lexer and parser import only `chevrotain`
- the visitor imports `FlowDB` *as a type only*, so the lexer/parser/visitor can run against any object that implements the ~14
  `yy` methods above
- the real `FlowDB` (`flowDb.ts`) is **not** standalone: it imports d3 `select`, js-yaml, `getConfig`,
  `rendering-util/shapes` (`isValidShape`), utils, DOMPurify and the tooltip helpers

A v13 parser should therefore emit a plain AST/IR and leave sanitizing and config to a later stage.

### 4.3 Skills (identical copies in both repos: `.claude/skills/{chevrotain-reference,migrate-diagram-to-chevrotain}/SKILL.md`, 197 + 286 lines)

**chevrotain-reference: key rules**
- CST + visitor, **never embedded actions**. The parser is pure: no db writes or logging inside `RULE` bodies, because grammar
  recording runs every body once at construction.
- **Singletons at module load.** One `Lexer` and one parser per diagram, reused via `parser.input = tokens`, never constructed
  per parse. `performSelfAnalysis()` comes last.
- Keep `maxLookahead` low. Use `tokenMatcher` over `instanceof` and avoid allocation in visitor hot paths. Consider `skipValidations` in production.
- Lexer: order matters, `categories` for token hierarchies, `Lexer.SKIPPED`, `line_breaks`, modes with push/pop, custom
  pattern functions.
- No left recursion (LL(k)).
- Fail fast with Mermaid-shaped errors and line/column; no error recovery. `async parse` with a lint
  disable.
- Small single-purpose files: tokens / lexer / parser / visitor / wrapper.

**migrate-diagram-to-chevrotain: key rules**
- Migrate one diagram at a time, **co-located** in `diagrams/<name>/parser/`, and abandon `packages/parser`.
- Engine switch is the INTERNAL `parser: {<id>|default: 'legacy'|'chevrotain'}`. It is honored only through
  `initialize/setConfig`, stripped from directives, and read inside `parse()`. Cutover flips the dispatcher fallback, not the schema default.
  **Legacy is never deleted during migration.**
- **Existing specs are the oracle:** fix the parser, not the specs, and keep the db API byte-for-byte.
- **Lexer-parity gate before any grammar:** token name+image versus the legacy lexer over harvested fixtures. Pay special attention
  to EOF, because jison's `$end` in a non-INITIAL state is an error while Chevrotain silently accepts it. To catch this, check
  push/pop balance through `checkLexerResult`.
- Parity traps the specs miss:
  - dead langium ValueConverters (the default converter actually runs)
  - statement terminators must be structural
  - **don't append a trailing `\n`** (this contradicts what the flowchart branch and `runChevrotainParse` do; the skill is newer)
  - port terminal regexes faithfully
- Fixtures are harvested from spec literals, `docs/syntax/<id>.md`, and `e2e/diagrams/<id>/*.mmd`, plus curated edge
  cases. `<id>.parity.spec.ts` must assert the exact rejected set. Convert to snapshots before the oracle is removed.
- **Build the source-mapped read-model** (`getAST()` spans, half-open `[start,end)`) following
  `usecase/usecaseAst.ts`. Explicitly *don't* copy the flowchart branch's `flowAst.ts`.
- Stale details in the skill: it says chevrotain `~11.1.2` (package.json has `~13.2.0`). It also says there is no `commonTokens/
  parserTestUtils` and no fallow gate, which is true for v13 develop but those exist on the sibling branch.

---

## 5. Config

- `src/schemas/config.schema.yaml` has **3,345 lines** and ≈500 `default:` entries.
- The generated `src/config.type.ts` has 2,712 lines and
  ≈570 typed properties.
- Top-level keys: theme, themeVariables, themeCSS, look, handDrawnSeed, layout,
  maxTextSize, maxEdges, elk{…}, darkMode, htmlLabels, fontFamily, altFontFamily, logLevel, securityLevel,
  startOnLoad, arrowMarkerAbsolute, secure, legacyMathML, forceLegacyMathML, deterministicIds(+Seed),
  dompurifyConfig, wrap, fontSize, markdownAutoWrap, suppressErrorRendering.
- There are also **≈34 per-diagram sections** (flowchart,
  swimlane, agentflow, sequence (≈170 lines), gantt, journey, timeline, class, state, er, pie, quadrantChart, xyChart,
  requirement, architecture, mindmap, ishikawa, kanban, gitGraph, sankey, packet, block, eventmodeling, treeView,
  radar, usecase, venn, cynefin, railroad…), many with per-diagram `theme/look/layout` "appearance" overrides.
- Defaults: `src/defaultConfig.ts` (358). `configKeys` is the whitelist used by directive sanitization.

Merge flow (`src/config.ts`, 358 LOC):

1. `defaultConfig` (frozen).
2. `initialize(conf)` → `setSiteConfig`: `siteConfig = defaultConfig ⊕ conf`, and `siteConfigDelta = conf`. If a theme
   is given, `themeVariables = theme[name].getThemeVariables(conf.themeVariables)`. `saveConfigFromInitialize` keeps
   the raw user theme vars so a directive theme switch can recompute.
3. Each render runs `processAndSetConfigs` (`mermaidAPI.ts:73`):
   - `preprocessDiagram` merges frontmatter `config:` and `%%{init: …}%%`/`%%{initialize}%%` plus `wrap` directives (`cleanAndMerge`)
   - `configApi.reset()`
   - `detectType`
   - `setDiagramConfigScope(type)`
   - `addDirective(cfg)`
4. `addDirective` → `sanitizeDirective` (`src/utils/sanitizeDirective.ts`, 119 LOC):
   - drops keys that are not in `configKeys`, or start with `__`, or contain `proto`/`constr`
   - runs `sanitizeCss` (brace-balance check only) on `themeCSS`/`fontFamily`/`altFontFamily`
   - validates dictionary patterns (e.g. `nodeColors`)
5. `updateCurrentConfig`:
   - `sanitize(d)` strips `secure` keys from each directive
   - deep `assignWithDepth` merge
   - `resolveAppearance` resolves theme/look/layout precedence: directive > initialize > diagram default > global
   - recomputes themeVariables if the theme changed
   - `checkConfig` emits deprecation warnings
- **Secure keys** (default): `secure, securityLevel, startOnLoad, maxTextSize, suppressErrorRendering, maxEdges`.
  The site can extend them through `secure: [...]`.
- `setConfig` is deprecated. Config is **module-global mutable state** (`siteConfig`, `directives`, `currentConfig`),
  and `getConfig()` deep-clones on each call. Concurrency across renders relies on the render queue in `mermaid.ts`.

---

## 6. Theming

- `src/themes/` has 5,588 LOC across **11 themes**:
  - default, base, dark, forest, neutral
  - neo, neo-dark
  - redux, redux-dark, redux-color, redux-dark-color

  `themes/index.js` maps name → `getThemeVariables`. `theme-helpers.js` holds shared derivation.
- Each theme is a JS class with constructor defaults, then `calculate(overrides)`: apply overrides, run `updateColors()`, apply overrides
  again. `updateColors()` derives everything with khroma (`darken/lighten/adjust/invert/rgba/isDark`, `mkBorder`).
  - ≈250 assignments per theme (theme-base: 224 unique `this.X =`). There are **≈270 distinct theme variables** across all themes.
  - Each theme makes ≈60–100 khroma derivation calls.
  - The variables include per-diagram ones (`git0..7`, `cScale0..11`, `pie1..12`, `fillType0..7`, sequence `actor*`, gantt
    `taskBkgColor…`, `quadrant*`, `xyChart` nested object, requirement/er palettes, `THEME_COLOR_LIMIT`).
- The `darkMode` flag only influences derivation (`mkBorder`, text color inversion). It does not switch palettes.
- Per-diagram CSS: **27 `styles.{ts,js}` files, 4,220 LOC**. Each is a template-literal function of themeVariables, and they are registered
  via `addStylesForDiagram` (`src/styles.ts`). Common wrapper CSS and keyframes are in `src/styles.ts` `getStyles`.
- **Colors are baked in as literals.** The `<style>` of each SVG contains resolved hex/rgba values, and inline `style=`
  attributes from `style`/`classDef`/`linkStyle` also carry literals. Only ~7 `var(--…)` uses exist (usecase fonts,
  git font, `--mermaid-font-family`).
- **Light/dark switching for a host app today requires a full re-render.** The host must call `initialize({theme:'dark'})` and then re-render every
  diagram, or render both variants up front. There is no CSS-custom-property theme layer, so `prefers-color-scheme`
  cannot be honored by a static SVG. GitHub and others work around this by rendering per color mode.
  `paletteCssGeneration.spec.ts` documents silent CSS breakage from palette loops (`stroke: undefined`), a symptom of
  string-templated CSS without validation.

---

## 7. Security: attack surface (structural)

`securityLevel` (`config.schema.yaml:315`, default `strict`):

| Level | Labels | click / callbacks | Final SVG |
|---|---|---|---|
| `strict` | DOMPurify (`FORBID_TAGS:['style']`, or the user `dompurifyConfig`) | `click … call fn()` **disabled** (`flowDb.ts:526` checks `!== 'loose'`); `href` links allowed through `sanitizeUrl` | DOMPurify on the whole SVG |
| `antiscript` | same as strict for labels | callbacks disabled | DOMPurify |
| `loose` | `removeScript` pre-pass skipped, but `sanitizeText` still runs DOMPurify (`FORBID_TAGS:['style']`) per label | `click node call fn(args)` → `utils.runFunc` walks the `window` path and invokes it (`utils.ts:267`); `bindFunctions` attaches listeners after insert | **not sanitized** |
| `sandbox` | as strict | effectively inert | SVG base64-embedded in `<iframe sandbox="allow-top-navigation-by-user-activation allow-popups">` (`mermaidAPI.ts:66,386`). Rendering itself also happens inside a sandboxed iframe |

- Quirk: `sanitizeMore` (`common.ts:70`) treats strict/antiscript/sandbox identically (DOMPurify `removeScript`).
  The HTML-entity-encoding branch is only reachable for an unrecognized level. "strict = HTML tags encoded" in the
  schema docs is therefore not what happens: strict **allows sanitized HTML in labels**.
- DOMPurify hooks (`common.ts:36`) preserve `target` on `<a>` and add `rel=noopener` for `_blank`.
  Tooltips use `tooltipElem.html(DOMPurify.sanitize(title))` (`flowDb.ts:662`).
- Attack surface:
  1. **HTML in labels → `foreignObject`** via `span.html()` (createText) and 16 other `.html(` sinks. The defense is
     DOMPurify-per-label plus the final whole-SVG pass, so any diagram that bypasses `sanitizeText` is an XSS. Historic CVEs are
     of exactly this kind:
     - CVE-2025-54880: architecture icon labels and icon SVGs unsanitized
     - CVE-2025-54881: KaTeX output not sanitized in sequence labels
     - earlier class/sequence label XSS
     - GHSA-cc8p/-c4c3 (tested in `e2e/other/pr-check/ghsa.spec.js`)
     - DOMPurify upstream bypasses (GHSA-55q2…, GHSA-6688…, bumped in `.changeset/bump-dompurify-3-4-17.md`)
  2. **Icons**: raw SVG strings from registered Iconify packs injected into labels and shapes.
  3. **CSS injection**:
     - `style`/`classDef`/`linkStyle` values go to inline `style` attributes, and classDef → `createCssStyles` emits rules with
       `!important` (only `sanitizeCss` brace balancing, `mermaidAPI.ts:132`)
     - `themeCSS`, `fontFamily` and `themeVariables` are directive-settable and spliced into the `<style>`
     - stylis middleware namespaces selectors under `#svgId` and whitelists at-rules (`@media/@supports/@layer/@scope/@container/@starting-style/@keyframes`; others become comments, `mermaidAPI.ts:290`)

     Risks are UI redress, data exfiltration via `url()`, and page-wide `@keyframes` pollution. Covered by
     `e2e/platform/css-injection.html` and `xss23-css.html`.
  4. **Directives/frontmatter** are a config injection channel. They are mitigated by the `configKeys` whitelist, the `__proto__`/`constr` filter,
     and the `secure` list, and there is historic prototype-pollution exposure through `assignWithDepth`.
  5. **Links**: `click X href "javascript:…"` → `sanitizeUrl` (`utils.ts:247`). `linkTarget` is passed through.
  6. **ReDoS / DoS**: preprocessing regexes (see the 865b75b538 fix), `maxTextSize` (50k) and `maxEdges` (500) caps.

  Test corpus: 25 `e2e/platform/xss*.html` pages, `ghsa1-3.html`, `click_security_{strict,loose,sandbox,other}.html`, and
  `e2e/other/pr-check/xss.spec.js` (22 tests) plus `ghsa.spec.js` (6).
- v13 implication: an SVG-only output with no foreignObject, no `<style>` (or a fixed stylesheet with CSS vars) and no
  `.html()` sinks would remove classes 1–3 structurally. The benchmark shows Pele/Ondine emit none of these constructs.

---

## 8. Test assets reusable for a v13 conformance suite

- **E2E `.mmd` corpus:** **2,376 `.mmd` files** under `e2e/`. Of these, 2,150 are in `e2e/diagrams/<diagram>/{pr-check,nightly-check,visual-check}/`
  (354 / 1,347 / 449), discovered automatically by `e2e/rendering/mmd-snapshots.spec.ts`. The other 226 are in
  `e2e/platform/dev-diagrams/` (performance flowcharts, layout-tests, a `tmp-v12.0.0-faulty-diags` regression set).
  - Per diagram: flowchart 400, class 285, er 206, sequence 193, requirement 172, git 135, state-v2 103, block 58,
    gantt 52, swimlanes 50, xychart 48, state 42, agentflow 39, mindmap 33, usecase 32, c4 32, timeline 30,
    treemap 26, pie 24, venn 21, architecture 20, sankey 18, journey 18, tree-view 15, quadrant 14, ishikawa 13,
    cynefin 12, kanban 11, wardley 10, railroad 9, radar/packet/eventmodeling 6, katex 4, conf-and-directives 4,
    info 2, zenuml 1.
  - Plus 45 Playwright spec files (`e2e/rendering/<diagram>/`, `e2e/other/`) with ≈141 inline-diagram tests
    (`imgSnapshotTest`), and Argos/Applitools baselines.
- **Unit specs:** 332 spec files in `packages/mermaid/src`. Approximate `it/test` counts per diagram folder:

  | Diagram | Tests |
  |---|---|
  | flowchart | 344 (15 parser spec files) |
  | class | 257 |
  | agentflow | 244 |
  | sequence | 197 |
  | er | 143 |
  | usecase | 138 |
  | railroad | 134 |
  | state | 122 |
  | treeView | 116 |
  | xychart | 78 |
  | git | 69 |
  | c4 | 53 |
  | requirement | 48 |
  | gantt | 44 |
  | cynefin | 42 |
  | block | 40 |
  | architecture | 37 |
  | mindmap | 36 |
  | venn | 36 |
  | kanban | 30 |
  | quadrant | 29 |
  | packet | 25 |
  | wardley | 24 |
  | radar | 20 |
  | pie | 16 |
  | swimlanes | 16 |
  | timeline | 11 |
  | eventmodeling | 10 |
  | journey | 10 |
  | sankey | 5 |
  | info | 4 |
  | ishikawa | 3 |
  | treemap | 0 |

  Plus langium grammar tests in `packages/parser/tests/`. Parser specs assert on **DB state**, which is the closest
  thing to a semantic oracle: they could be re-pointed at a v13 IR with an adapter.
- **Conformance precedent:** `src/diagrams/agentflow/conformance/` (runner plus 16 fixtures as `.mmd` + `.expected.json`
  pairs, including parse-error cases) is already a language-neutral input→expected-model format, and is the best template for a
  v13 suite.
- **Layout fixtures:** DDLT (`rendering-util/layout-algorithms/ddlt/`, swimlanes `*.ddlt.spec.ts`) captures node
  sizes and validates or scores layouts without a DOM. It is reusable for a non-DOM v13 layout engine.
- **Docs examples:** `packages/mermaid/src/docs/syntax/*.md` (38 files) contain **513 ` ```mermaid-example ` blocks**, which are
  the user-facing syntax promises. Harvesting them is already recommended by the migrate skill.
- **Differential tooling** from the sibling branch: `flow.parse-corpus.spec.ts` (accept/reject parity over arbitrary
  `.mmd` dirs; 1,587 real diagrams already run), `flow.db-parity.spec.ts` and `flow.lexer.spec.ts`. These are generic patterns
  for "old engine is the oracle".
- **Security corpus:** `e2e/platform/xss*.html`, `ghsa*.html`, `css-injection.html`, and `e2e/other/pr-check/{xss,ghsa}.spec.js`.
  They should become v13 "must not execute / must not emit" tests.
- **Proposed v13 conformance layers:**
  - (1) parse: accept/reject + IR snapshot, from spec literals, docs, e2e `.mmd` and agentflow-style `.expected.json`
  - (2) layout: DDLT validate/score
  - (3) render: structural SVG assertions plus visual diff on the pr-check tier
  - (4) security: the XSS corpus

---

## 9. Diagram inventory (non-spec .ts/.js/.jison LOC under `src/diagrams/<name>/`)

| Diagram | LOC | Parser | Notes |
|---|---|---|---|
| sequence | 5901 | jison | own renderer (svgDraw), DOM text width via utils |
| usecase | 5378 | **chevrotain** | reference migration, source-span AST |
| agentflow | 4691 | jison (fork of flow lexer) | beta. Conformance fixtures |
| state | 3108 | jison | v2 unified renderer |
| flowchart | 3009 | jison (→ chevrotain on branch) | flowDb 1422 LOC. Renderer only 57 LOC; real work in rendering-util |
| class | 2777 | jison | classBox shape. Own measuring |
| c4 | 2730 | jison | legacy hand-positioned renderer |
| git | 2607 | langium | |
| gantt | 2319 | jison | dayjs |
| xychart | 2288 | jison | |
| railroad | 2140 | langium ×4 (railroad, abnf, ebnf, peg) | |
| architecture | 2034 | langium | cytoscape fcose |
| er | 2013 | jison | |
| wardley | 1825 | langium | |
| timeline | 1816 | jison | |
| block | 1766 | jison | |
| mindmap | 1532 | jison | cose-bilkent / tidy-tree |
| quadrant-chart | 1217 | jison | |
| journey | 1151 | jison | |
| eventmodeling | 1098 | langium | |
| treemap | 1076 | langium | no unit specs |
| cynefin | 884 | langium | |
| requirement | 871 | jison | |
| treeView | 840 | langium | |
| common | 823 | — | sanitize, KaTeX, shared DB, chevrotain pipeline |
| venn | 811 | jison | @upsetjs/venn.js |
| ishikawa | 774 | jison | |
| kanban | 673 | jison | |
| radar | 564 | langium | |
| sankey | 521 | jison | d3-sankey |
| pie | 500 | langium (→ chevrotain on branch) | |
| packet | 385 | langium | |
| error | 179 | — | |
| info | 93 | langium | |
| swimlanes | 63 | (flowchart's) | layout-variant of flowchart. Layout in rendering-util/swimlanes (13k LOC) |
| zenuml | external pkg | @zenuml/core | |

Totals: `packages/mermaid/src` holds ≈118k non-spec LOC (excluding docs). Of that, `rendering-util/` is ≈47.8k, of which shapes are ≈10k
and layout algorithms ≈30k (swimlanes 13.1k, grid 7.8k, elk 3.9k, layout-utils 2.6k, dagre 1.3k). Core:
`mermaidAPI.ts` 795, `mermaid.ts` 476, `config.ts` 358, `utils.ts` 983, `Diagram.ts` 106.
Detection order and lazy registration: `src/diagram-api/diagram-orchestration.ts`. Detector regexes:
`src/diagram-api/regexes.ts`.
