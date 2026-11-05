# Mermaid v13 — Design

Status: **Draft for review** · 2026-10-31, updated 2026-11-02 for the requirements review (D46–D63)
Implements: [REQUIREMENTS.md](REQUIREMENTS.md) · Decisions: [DECISIONS.md](DECISIONS.md) · Research: [research/](research/)

This document describes how v13 is built. It is written for the people who will implement M1, and it also sets the shape that M2–M5 must fit. Requirements are cited as `R-…`. Decisions that need an ADR are marked **[ADR-n]** and listed in §16. Places where this design adds something the decision log does not cover, or reads a decision a particular way, are marked **⚠ review**.

---

## 1. Overview

```
             ┌──────────────────────────── packages/core ─────────────────────────────┐
 text ──► preprocess ──► detect ──► parse ──► layout ──► render ──► serialise ──► svg string
          (front matter,  (plugin    (diagram  (shared    (diagram   (SvgWriter,
           directives,    detectors)  parser,   layered    draws via  escaping,
           comments,                  parser    engine or  SvgWriter  numbers)
           source map)                kit)      plugin)    + theme)
              │                         │          │           │
              ▼                         ▼          ▼           ▼
         ResolvedConfig (frozen) ── passed explicitly into every stage (R-ARCH-5)
                                        │
                                        └──► ParseResult also carries spans, symbols,
                                             diagnostics ──► language-service (M2.5)
                                   LayoutModel ──► diagram ascii hook + core/ascii (M2, §6.3)
```

The core rules:

- Every stage is a pure function of its inputs: plain data in, plain data out (R-ARCH-1, -2, -4).
- Nothing is global. Plugin registration is held by a `Registry` instance that the public `mermaid` package owns (§12).

## 2. Packages (R-PLUG-1, D25)

```
packages/
  core/                 @mermaid-js/core      — pipeline, parser kit, measurer, layout, SvgWriter, theme, config
  diagram-flowchart/    @mermaid-js/diagram-flowchart — parser, model, graph builder, shapes, renderer
  mermaid/              mermaid               — public API (render/parse/initialize/run/…), Registry,
                                                DOM adapter (run, mount), plugin discovery, bundles
  conformance/          (private) parity oracle, corpus runners, normalisers — devDeps: mermaid@12
  bench/                (private) successor of mermaid-v13-approches harness (R-TEST-7)
  plugin-interactions/  @mermaid-js/plugin-interactions — v12 click callbacks as an extension plugin (§12.3)
tools/
  gen-metrics/          font metric table generator (§5.2)
  gen-config/           schema → per-package defaults + config reference doc (§9)
  gen-grammar/          grammar file → dev-only oracle parser, fuzz sentences, highlighters, syntax docs (§4.4)
```

Later milestones add the `core/ascii` subpath and a `mermaid` CLI bin (M2, §6.3), `packages/language-service`, `language-service-codemirror`, `language-service-monaco` and `language-server` (M2.5, §4.5), `packages/diagram-<type>` (M3+) and `packages/plugin-elk|math|icons|handdrawn`.

`core` exports these subpaths so diagram packages can import only what they need:

- `@mermaid-js/core/parser-kit`
- `/layout`
- `/svg`
- `/text`
- `/theme`
- `/config`
- `/ascii` (M2): the text-grid kit (§6.3), never imported by an SVG render

**Allowed dependency directions:**

- `diagram-*` → `core`.
- `mermaid` → `core` + `diagram-*`.
- `core` imports nothing.
- `diagram-*` never imports another `diagram-*`. This carries over the v12 isolation rule, and is now enforced with an eslint `no-restricted-imports` rule.

## 3. Public API and runtime flow (R-API-*, R-COMPAT-5)

```ts
// packages/mermaid
render(id: string, text: string, container?: Element): Promise<RenderResult>   // v12 signature kept; = prepare + renderSync
render(id: string, text: string, options: RenderOptions & { format: 'ascii' }): Promise<TextRenderResult>   // M2 (D80)
prepare(text: string, options?: RenderOptions): Promise<Prepared>              // new (R-API-2): detect, parse, load resources
renderSync(text: string, options?: RenderOptions): RenderResult                 // new (R-API-2): sync, pure, loaded resources only
renderSync(text: string, options: RenderOptions & { format: 'ascii' }): TextRenderResult   // M2 (D80)
preload(req: { types?: string[]; iconPacks?: string[]; layouts?: string[]; math?: boolean }): Promise<void>  // new (R-API-2)
supportsFormat(type: string, format: 'svg' | 'ascii'): boolean                  // new (R-ASCII-5)
parse(text: string, parseOptions?: { suppressErrors?: boolean }): Promise<ParseResult | false>
initialize(config: MermaidConfig): void        // sets defaults for run()/render() calls (no global render state)
run(options?: RunOptions): Promise<void>
mount(el: Element, text: string, options?: MountOptions): Mounted               // new (R-API-7)
detectType(text: string): string
registerExternalDiagrams(defs: DiagramPlugin[], opts?: { lazyLoad?: boolean }): Promise<void>
registerLayoutLoaders(loaders: LayoutLoader[]): void
registerIconPacks(...): void                   // stub + warning until plugin exists
setParseErrorHandler(fn): void                 // deprecated

interface RenderResult {
  svg: string; diagramType: string;
  width: number; height: number;
  warnings: Warning[];
  bindFunctions?: (el: Element) => void;       // set only when the interactions plugin is installed (§12.3)
}
interface TextRenderResult {                   // M2 (R-ASCII-4, D80)
  format: 'ascii'; text: string;               // '\n' line ends, no trailing spaces, byte-deterministic
  columns: number; rows: number;
  diagramType: string; warnings: Warning[];
}
```

**The `initialize()` paradox.** v12's `initialize` writes global state. In v13, `mermaid` keeps one `defaults` object, which is set by `initialize`, and every call reads it once into its `ResolvedConfig`. This is the only module-level state, and it lives in the public package, not in core. Core functions all take config as an argument (R-ARCH-4, -5).

**Two phases (R-API-2, D51).** Everything that can wait on the network happens in `prepare`; everything after it is synchronous and pure.

`prepare(text)` (async):

1. `limits.checkSource(text)` (R-SEC-5).
2. `preprocess(text)` returns `{ bodyStart, frontMatter, directives }` (§4.1).
3. `registry.detect(body)` returns the plugin manifest; its entry is imported if not loaded.
4. `resolveConfig(…)` and `plugin.parse(body, ctx)` run once to find the **resource set**: the diagram package, the layout engine named by config, icon packs referenced by the AST, and math if any label uses it. Each plugin reports its needs through an optional `resources(ast, ctx)` method.
5. Missing resources are loaded in parallel. The parse result is cached against the text, so `renderSync` right after `prepare` doesn't parse twice.

`renderSync(text)` (sync):

1. Steps 1–3 above, without loading. A missing resource throws `NotLoadedError { missing: Resource[] }`, unless `options.placeholders` is set, in which case a placeholder is drawn (e.g. an empty icon box) and a warning added.
2. `resolveConfig(defaults, initializeConfig, frontMatter.config, directives, pluginDefaults)` returns a frozen `ResolvedConfig` (§9).
3. `plugin.parse(body, ctx)` returns `ParseResult<Model>` (§4). If it has error diagnostics, throw `MermaidError`. Extension `postParse` hooks run on the AST (§12.2).
4. `plugin.layout?(model, ctx)` returns the plugin's layout `L`. For graph diagrams that is a `LayoutModel`, usually from the shared engine through `ctx.layout(graph)` (§6). `postLayout` hooks run on `{ kind, diagram, layout }` (§12.2).
5. `plugin.render(layout, model, ctx, writer)` writes into an `SvgWriter` (§7). `postRender` hooks run on the node tree.
6. `writer.finish(root)` produces the string; `limits.checkOutput`.
7. The result is `{ svg, warnings: ctx.warnings, … }`.

`preload(…)` runs step 5 of `prepare` for an explicit list, for hosts such as markdown-it or SSR that can't await per diagram.

`ctx` is a `RenderContext`: `{ config, measurer, theme, limits, warn(), now }`. It's created per call, is frozen except for the warning sink, and is the only thing passed to plugins.

## 4. Parsing (R-PARSE-*, D14)

### 4.1 Preprocess (core)

Preprocessing keeps v12's semantics (P1) but **never rewrites the source text**. It scans and returns ranges into the original string, so every offset, line and column the parser sees is the user's own:

- CRLF: the lexer treats `\r\n` and `\r` as one newline; the text is not normalised
- **Front matter: one shared parser** in core (`core/frontmatter`), built on the parser kit like the diagram parsers instead of v12's fence regex. A line scanner finds the opening `---` (first non-blank line) and the closing `---` line. An unclosed fence is an error diagnostic whose `related` points at the opener. The YAML reader (below) reports diagnostics with real ranges, so a front-matter typo is reported at its own line like any diagram error. Every diagram type gets this for free, and no diagram parser ever sees front matter. Where it differs from v12's regex on edge inputs (e.g. no newline after the closing fence), the parity corpus finds the case and we decide each one.
- `%%{init|initialize|wrap}%%` directives are located by range and read, then left in place; the lexer skips them as trivia
- `%%` comments are **not stripped**. The parser kit has one shared `Comment` trivia token kind; lexers emit it and parsers skip it, so line numbers stay exact. v12's stripping is what breaks line numbers today, so v13 does not repeat it. Editors can still read comments from the token stream.
- entity decoding happens per label at parse time, on that label's own range

It is done in **linear-time scans only** (R-PARSE-7). Front matter is parsed by a built-in YAML subset reader, ported from Pele's `util/yaml.ts` with attribution (R-REL-4). That reader has prototype-key protection and a depth cap of 64.

Because nothing is rewritten, there is **no SourceMap**: diagnostics, symbols, statements and AST ranges use original offsets directly. If a later step ever has to rewrite text, it must record `Edit { at, removed, inserted }` and map back lazily, as Pele does (`errors.ts:27-48`), and that needs an ADR.

### 4.2 Parser kit (`core/parser-kit`)

The kit has no grammar abstraction. It is a set of building blocks for hand-written lexers and recursive-descent parsers:

| Piece | Shape | Notes |
| --- | --- | --- |
| `TokenStream` | parallel arrays `kind: Uint16Array`, `start: Uint32Array`, `end: Uint32Array`, `text: string[]` | No token objects. Kinds are numeric `const` objects (not TS `enum`, per lint rules). |
| `CharClass` | `Uint8Array(128)` tables + Unicode id-letter table (base-36 RLE, generated from `flow.jison`) | Port of Pele's `util/unicode.ts` approach. |
| `Scanner` | sticky-regex helpers + linear matchers | Regexes on user input must pass a "no nested quantifier" lint (R-PARSE-7). |
| `Diagnostics` | `{ severity, code, message, range, expected?, related? }[]` | `related` points at the opener of an unclosed construct (R-ERR-2). |
| `Recovery` | `syncTo(stream, kinds)`: skip to next statement boundary (newline / `;` / `end`) | Lets the parser emit N diagnostics for N errors (R-PARSE-4). |
| `Symbols` | `{ name, kind, range, role: 'def' \| 'ref' }[]` | Each node id occurrence. Used for definition, references and rename (R-PARSE-3/5). |
| `Statements` | `{ kind, range, children? }[]` | For folding and code↔diagram highlighting. |
| `Expected` | groups raw token kinds into ≤ 5 human names ("an arrow such as `-->`") | Grouping table per diagram (R-ERR-2). |

```ts
interface ParseResult<M> {
  model: M;                       // plain, serialisable (structuredClone-able)
  ast: AstNode;                   // typed, documented, public (R-PARSE-8)
  diagnostics: Diagnostic[];      // errors + warnings, ranges in ORIGINAL source
  symbols: SymbolOccurrence[];
  statements: StatementSpan[];
  tokens?: TokenStream;           // only when ctx.config.internal.keepTokens (editors)
}
```

Spans cost almost nothing (the research measured 2 bytes gzipped for identifier spans), so they are always produced. Only the token stream, which can be large, is opt-in.

**AST and source ↔ diagram mapping (R-PARSE-8, D53).** `AstNode = { id: AstId, type, range, children? , … }`, with one exported type per node kind per diagram (`FlowNodeStmt`, `FlowEdge`, `FlowSubgraph`, …). `AstId` is a short **semantic** id built from the user's own names, not from offsets, so it survives edits elsewhere in the text, including edits to the element's own label:

- node: `n:A`; its second mention in the text: `n:A@2`
- edge: `e:A>B`; a second parallel edge between the same nodes: `e:A>B#2`
- subgraph: `s:<id>`
- statements without a user name (`style`, `classDef`, `linkStyle`, …): kind plus ordinal among its siblings, e.g. `st:3`

An id changes only when the element itself is renamed, or when a parallel edge or a same-kind anonymous statement is inserted before it. Both are edits the editor made, so it knows. Ids are computed in the parser with no extra pass. Each diagram defines its scheme in its AST types, and flowchart's is the one above. The model keeps the `AstId` of every vertex, edge and subgraph, and the renderer writes it as `data-ast` on the element it draws (`data-ast` is in the attribute allow-list). An editor maps a cursor to elements with `querySelectorAll('[data-ast="…"]')` and an element back to source through `ast` lookup by id. For a UI edit, such as a label text box, the editor patches the text at the node's current `range`, re-parses, and gets the same id back, so selection and focus survive. `data-id` (R-SVG-2) stays the user's id, which edges and repeated node mentions don't have uniquely.

### 4.3 Flowchart parser (`diagram-flowchart/src/parser/`)

- `lexer.ts`: a state machine that mirrors `flow.jison`'s start conditions, the way Pele's flowchart lexer does. The Chevrotain branch's `flow.tokens.ts` / lexer specs serve as the token-level reference.
- `parser.ts`: recursive descent producing a `FlowModel`. It is not a v12 `FlowDB`, but there is a 1:1 normaliser to the `flow.db-parity.spec.ts` snapshot shape (§13.1).
- `FlowModel` = `{ direction, vertices: Map<id, Vertex>, edges: Edge[], classes, subgraphs, tooltips, links, accTitle, accDescr, warnings }`. It keeps insertion order (R-ARCH-7).
- Shape data `@{ … }` is parsed with the core YAML reader. Shape names are validated against v12's list, with v12's error messages.
- `click … callback|call` is parsed into the model (`FlowModel.callbacks`). The renderer ignores it. If no extension plugin claims callbacks (§12.3), a warning diagnostic `CALLBACK_IGNORED` is added (R-SVG-5).

### 4.4 Grammar files (R-PARSE-9, D54)

Each diagram package has `grammar/<type>.ebnf`: a concise EBNF with lexer modes (the equivalent of jison start conditions). It is the normative definition of the syntax; the hand-written parser is the fast implementation of it. `tools/gen-grammar` turns it into:

| Output | Used for | Ships? |
| --- | --- | --- |
| A generated reference parser (table-driven, slow is fine) | Differential test against the hand-written parser in CI: same accept/reject and same AST shape on the corpus and on generated sentences | No (dev/CI only) |
| A sentence generator (bounded depth, weighted by corpus frequency) | Fuzz input for R-SEC-7 and the differential test | No |
| TextMate, Monarch and Lezer grammars | Syntax highlighting in VS Code, Monaco, CodeMirror (R-LANG-2) | As separate artefacts, not in core |
| Syntax reference page | Docs | Docs only |

Conflicts between the three sources of truth are resolved in this order: the oracle (`mermaid@12`) decides what is valid syntax (R-COMPAT-2); the grammar file is fixed to match; the hand-written parser must match the grammar. A divergence from the oracle is listed in `divergences.json` as usual.

### 4.5 Language service (M2.5, R-LANG-*, D88–D99)

Built only on parser kit outputs (R-LANG-1). Four packages (D88):

| Package | Deps | Contents |
| --- | --- | --- |
| `@mermaid-js/language-service` | none at runtime | document model, generic features, `firstPartyFacets` |
| `@mermaid-js/language-service-codemirror` | peer `@codemirror/*` | `mermaid()` extension |
| `@mermaid-js/language-service-monaco` | peer `monaco-editor` | `registerMermaid(monaco)` |
| `@mermaid-js/language-server` | `vscode-languageserver` | LSP over stdio, `mermaid-language-server` bin |

**Language facet (R-LANG-8, D89).** Diagram knowledge stays in the diagram package, exported from `./language` with no renderer imports. The types live in `@mermaid-js/core/parser-kit` (diagram packages import only core) and `@mermaid-js/language-service` re-exports every one a facet author needs:

```ts
interface LanguageFacet<A extends AstNode = AstNode> {
  id: string;                                            // 'flowchart'
  parse(text: string, opts: { keepTokens: true; probe?: number }): ParseResult<unknown, A>;
  categories: Readonly<Record<TokenKind, TokenCategory>>; // generated by gen-grammar (D94)
  namespaces: readonly (readonly string[])[];            // flowchart: [['node','subgraph'], ['class'], ['edge']]
  isValidId(name: string, kind?: string): string | undefined; // per symbol kind; undefined = ok, else the reason (D92)
  completions(probe: ProbeResult, doc: DocumentView<A>): CompletionItem[]; // D95
  hover(at: HoverTarget, doc: DocumentView<A>): Hover | undefined;        // D93; docs from the syntax reference
}
interface DocumentView<A> { text: string; result: ParseResult<unknown, A> } // read-only; hover: the snapshot's parse, completions: the probe parse
interface HoverTarget {
  offset: number;
  token?: { kind: TokenKind; range: Range };   // the non-blank token under (or ending at) the offset
  symbol?: SymbolOccurrence;                   // the parser's symbol occurrence there
}
```

`parse` contract: the whole text (front matter and directives included), N errors in, N diagnostics out, never throws, pure. It need not repeat preprocess diagnostics: the service merges `preprocess(text).diagnostics` itself and drops one the facet also reports (same code and range). A facet whose `parse` throws gets one `LANGUAGE_FACET_FAILED` error on the header word and generic features only for that text.

The manifest gets `"language": "./dist/language.js"`. `firstPartyFacets` is generated like `registry.gen.ts` (§12.4), one row per v12 type in detector order: `{ type, id, section?, detector, load? }` (`type` the v12 type such as `flowchart-v2`, `id` the diagram id, `section` the config section the renderer reads, `load` only for a type with a v13 facet). Third-party rows (`FacetEntry`, which may carry the `facet` itself instead of `load`) are passed to `createLanguageService({ facets })`. The LSP server finds them only when the client opts in with `initializationOptions.mermaid.plugins: true` (D157): then it scans each workspace folder's own `node_modules` for manifests with `language` (realpath-confined, 5 s per import); by default it serves first-party types only and runs no code from the opened folder.

**Document model (R-LANG-4, D90, D155).**

```ts
const service = createLanguageService({ facets?, schema? });
await service.preload({ types? });       // loads facets first (default: every row with a load), like render's preload (ADR-9); never rejects
const doc = service.update(uri, text);   // synchronous, complete, immutable snapshot; full re-parse
doc.diagnostics(); doc.definition(offset); doc.references(offset, includeDeclaration?);
doc.prepareRename(offset); doc.rename(offset, newName);   // edits or { refused: reason }
doc.hover(offset); doc.completions(offset);
doc.foldingRanges(); doc.lineFoldingRanges();             // offsets; by line as editors fold
doc.semanticTokens(); doc.lineSemanticTokens();           // whole tokens; cut per line
doc.lines();                                              // the text's LineIndex
doc.astAt(offset); doc.rangeOf(astId);                    // R-LANG-6, D97
```

`DocumentSnapshot` is an interface: hosts cannot construct one, and the snapshot's parse is not reachable from it. Everything a query returns is frozen; a facet's hover gets a `DocumentView` whose parse is frozen (the result, its diagnostics, the symbol and statement arrays, the token, AST and model objects), and the queries copy what they need out of it before the facet runs (D90).

`update` never returns a partial snapshot. A detected type whose facet was not preloaded gets one `LANGUAGE_NOT_LOADED` info diagnostic naming the type, plus the generic features, until the host preloads it. A facet whose load failed gets a `LANGUAGE_LOAD_FAILED` warning (also when the module has no complete facet: `completions` and `hover` are required), one whose `parse` throws a `LANGUAGE_FACET_FAILED` error; both serve generic features only.

All positions are UTF-16 offsets into the full text, as the parser already uses; adapters convert with `LineIndex`. The snapshot keeps the `ParseResult` (with tokens). Queries are computed lazily and memoised on the snapshot. `completions(offset)` re-parses with `probe: offset`. Budget: update + all queries ≤ 15 ms (D156) at 50k chars.

**Feature sources.**

| Feature | From |
| --- | --- |
| diagnostics | `preprocess` + `parse` diagnostics as they are, each once (D91); front-matter config warnings (D96); info diagnostic for a type with no facet |
| definition / references / rename | `symbols` grouped by the facet's `namespaces`; definition = first `def` (D92) |
| folding | every `statements` span covering more than one line (subgraphs, multi-line `accDescr { }` and `@{ }`), plus the front-matter range; `lineFoldingRanges` keeps a closing `end`/`}`/`---` line visible, one fold per start line |
| semantic tokens | `tokens` × facet `categories`, modifiers from symbol roles (D94); `lineSemanticTokens` cuts them per line without continuation indentation, never overlapping |
| completion | probe (below) × facet `completions` (D95); config keys from the schema (D96) |
| hover | AST + model via the facet (D93); config keys from the schema |
| astAt / rangeOf | AST ids and ranges (R-PARSE-8) |

The service also exports what makes the three adapters show the same thing: `lineFoldingRanges`, `lineSemanticTokens` and `encodeSemanticTokens` (LSP/Monaco data), `diagnosticMessage` (the message with `Expected: …`, as core's `formatDiagnostic` renders it) and `COMPLETION_TRIGGERS`.

**Probe (R-LANG-7, D95).** The kit gets a `Probe` recorder for an optional offset. At the first token that ends at or after it, every kind the parser tests there is recorded: `TokenCursor.at`/`eat`/`peek` do it for parsers built on the cursor, and parsers with their own token loop (flowchart's parser indexes the stream directly) call `probe.tested(kinds)` at the same decision points where they build `fail([...])` expectation lists. The lexer records its state (flowchart: the `S` start condition) at the offset. The parse continues with normal recovery. `ParseResult.probe = { offset, expected: TokenKind[], mode: string, prefix: Range }`. Without a probe the cursor takes no extra branch on the hot path.

**Front matter (R-LANG-5, D96).** The YAML reader gains an opt-in mode that returns a node tree with key and value ranges and keeps reading after an error (one error per bad line). The service walks `config:` against the gen-config JSON schema, scoped to the detected type.

**Adapters (R-LANG-2, D98).** Each awaits `service.preload()` before its first snapshot (D155). CodeMirror: Lezer language from #21, `linter`, `autocompletion`, `hoverTooltip`, `foldService`, semantic-token decorations, a cursor → `AstId` facet; diagnostics debounced ~150 ms. Monaco: language id, Monarch tokens from #21, every provider. LSP: stdio, push diagnostics, `textDocument/{definition,references,prepareRename,rename,hover,foldingRange,semanticTokens/full,completion}`, `.mmd`/`.mermaid` and language id `mermaid`; third-party facets only on opt-in (D157). All three take folds, per-line tokens, diagnostic messages (related places kept) and completion trigger characters from the service, so one document looks the same in each. First-paint highlighting (Lezer, Monarch) is generated for flowchart only today; other types get semantic tokens once their facet lands.

**M2.5 work breakdown** (spec #26; items 1–11 are #27–#36 and #38, in order):

| # | Work item | R-ids | Depends |
| --- | --- | --- | --- |
| 1 | Parser-kit probe mode + flowchart wiring | R-LANG-7 | M1 #6, #8 |
| 2 | gen-grammar kind → category table + four-way agreement test | R-LANG-1 | M1 #21 |
| 3 | Flowchart parser-only entry and `./language` facet skeleton, manifest `language` | R-LANG-8 | M1 #8 |
| 4 | YAML reader with key/value ranges and error recovery | R-LANG-5 | M1 #5 |
| 5 | language-service core: snapshot, diagnostics, symbols features, folding, semantic tokens, astAt/rangeOf, firstPartyFacets | R-LANG-1/4/6 | 2, 3 |
| 6 | Completion and hover (flowchart facet tables) | R-LANG-1 | 1, 5 |
| 7 | Front-matter config completion/hover/warnings | R-LANG-5 | 4, 5 |
| 8 | Golden suite, oracle expectations through the service, property/budget tests | R-LANG-3/4 | 5 |
| 9 | CodeMirror adapter + example editor | R-LANG-2 | 6 |
| 10 | Monaco adapter + example editor | R-LANG-2 | 6 |
| 11 | LSP server + scripted client test | R-LANG-2 | 6 |

## 5. Text (R-TEXT-*, D17)

### 5.1 Measurer

```ts
interface Measurer {
  width(text: string, font: FontKey, style: StyleBits): number;   // px at font.size
  metrics(font: FontKey): { ascent: number; descent: number; lineHeight: number };
  readonly id: string;   // part of determinism key (R-ARCH-6)
}
type FontKey = { family: string; size: number; weight: number };  // interned
type StyleBits = number;  // Bold|Italic|Mono|Sub|Sup|Underline
```

- **`canvasMeasurer`** is the browser default. It measures the whole string with `measureText` (OffscreenCanvas when available), keeps an LRU cache of 20k entries per font, and doesn't cache widths while `document.fonts.check` is false. The cache is cleared when `document.fonts.size` changes. Core doesn't import it; `mermaid` injects it, so core stays free of the DOM (R-ARCH-1).
- **`tableMeasurer`** is the Node default and is always used under `deterministic: true`, even when an integrator passes a `measurer` (R-TEXT-7). It sums packed advance widths and applies the wide, zero-width and default-width rules. It is used in all tests.
- **Vertical metrics** come from the table (ascent/descent), not a fixed 0.35 em shift. This is an improvement on Pele: labels centre correctly for fonts with unusual metrics.

### 5.2 Fonts ⚠ review

The v12 default is `"trebuchet ms", verdana, arial, sans-serif` (P1). The table measurer needs one concrete table per family, so this design proposes:

- Ship tables for **Trebuchet MS, Verdana and Arial**, regular and bold, printable ASCII plus Latin-1. That is about 190 characters per weight per family, roughly 2 KB gzipped in total.
- Resolve the first family in the stack that has a table.
- For an unknown family, fall back to the Arial table.
- Generate the tables with `tools/gen-metrics` from font files. Font metrics are facts, so no font files are shipped.

Open question: Trebuchet MS isn't installed on most Linux systems, so browser output there uses Verdana or Arial and differs from Node output. That's acceptable, because `deterministic: true` exists. **[ADR-5]**

### 5.3 Labels

`layoutLabel(raw, font, maxWidth, measurer) → LabelBox { lines: Run[][], width, height }`:

- **Fast path:** a plain label without `<`, `&`, `*`, `_` or `` ` `` is measured once and wrapped only if it overflows (from Pele).
- **Markdown strings:** bold, italic, inline code and line breaks (R-TEXT-2), plus bullet lists (R-TEXT-11): a line starting with `- ` or `* ` inside a markdown string becomes a list run, with one nesting level from leading indentation. It is drawn as a `•` (or `◦` when nested) followed by a hanging indent of the bullet width plus one space; wrapped continuation lines align to the text, not the bullet. Plain labels never treat `- ` as a bullet.
- **HTML subset:** `<br>`, `<b>`, `<strong>`, `<i>`, `<em>` become style bits. Other known tags are dropped and their text kept. Anything else stays as literal text (R-TEXT-3). The final list waits on O-5.
- **Wrapping:** greedy, word-based, CJK-aware with kinsoku rules, and handles soft hyphen and ZWSP (R-TEXT-8).
- **Emitted** as one `<text>`, with `<tspan>` only for multi-run or multi-line labels.
- **Inline boxes (D177, M3.5):** an extension registers a provider for a delimiter pair (`ExtensionPlugin.inline`, §12.2). Before anything else, label layout hands each delimited span (the text between the delimiters, untouched by line breaks, markdown or HTML) to its provider with the label's font, `measurer.metrics(font)` and `ex` (half the font size: the tables carry no x-height). The provider returns a measured box `{ width, height, baseline, node }`, where `node` is an `SvgFragment` (a detached `{ tag, attrs, children }` tree), or `undefined` to keep the span as written (for example while its engine has not loaded). The box becomes a run `{ kind: 'box', text, width, height, baseline, node }` whose `text` is its source as written, so text output and other text readers see the TeX. Line breaking treats a box as one unbreakable piece: it moves to a new line when it does not fit and is never split. A box taller than the font grows its line (above and below the baseline), recorded as `LabelBox.baselines`. `SvgWriter.label()` draws a label that holds a box with `text-anchor: start` and every line placed from its measured widths; each box follows the `<text>` as a `<g transform="translate(…)">` at its top-left corner, its baseline on the line's, carrying the label's `class`, `fill` and `style`. The writer replays the fragment through `open`/`leaf`/`text`/`close`, so the allow-list holds (R-SEC-2). Boxes reach a label through `layoutLabel`'s `inline` option, set from `RenderContext.inline` (SVG only; text output shows every span as written).
- **Without a provider**, a label is laid out exactly as before (byte-identical output), and a label with a `$$…$$` pair adds one `MATH_NOT_RENDERED` warning per render. The warning names the feature, not a package (D153, D176).

## 6. Layout (R-LAYOUT-*, D18)

### 6.1 Interface

```ts
interface LayoutGraph {
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  nodes: { id: string; width: number; height: number; parent?: string; shape?: string }[];
  edges: { id: string; source: string; target: string; minLen: number; label?: { width: number; height: number } }[];
  groups: { id: string; parent?: string; direction?: Dir; padding: Box; title?: { width: number; height: number }; algorithm?: string }[];
  spacing: { node: number; rank: number; edge: number };
  availableWidth?: number;          // R-LAYOUT-5
}
interface LayoutModel {
  width: number; height: number;
  nodes: Map<string, { x: number; y: number; width: number; height: number }>;
  edges: Map<string, { points: Point[]; label?: Point; ports: { source: Side; target: Side } }>;
  groups: Map<string, { x: number; y: number; width: number; height: number; title: Point }>;
  direction: Dir;                   // may differ from input when availableWidth flipped it
}
type LayoutEngine = (g: LayoutGraph, ctx: LayoutContext) => LayoutModel;   // synchronous (D172)
interface LayoutContext { config?: ResolvedConfig }   // M3.5: `mermaid` always passes the render's config
```

**Scope.** `LayoutGraph` and `LayoutModel` are the shared contract for **graph diagrams** (flowchart, class, state, ER, …) that call `ctx.layout(graph)`. They are not the universal layout output. A non-graph diagram (Sankey, pie, gantt, xychart, …) defines its own layout type `L` and computes it in `plugin.layout` (§12.1). It may reuse `core/layout` primitives, such as rank assignment for Sankey columns, without the whole engine. Measurement-before-layout applies to every `L`. DDLT-style fixtures and the shared ASCII path apply to `LayoutModel` only.

The rules:

- The graph and the result are plain data, so the ASCII backend (M2) and DDLT-style fixtures can use them directly (R-ARCH-3).
- Measurement happens **before** layout: diagram code fills in `width` and `height` using the injected measurer, and the engine never measures. Layout depends on the measurer and the unit profile only, never on a backend (R-ARCH-3, D57, D77). For ASCII the same code runs with the cell measurer and the cell profile (widths in cells, heights in rows), so the ASCII path receives a normal `LayoutModel` and never measures itself (§6.3).
- The engine is selected by the `layout` config key. `layered` is the default. Other engines are registered via `registerLayoutLoaders` (R-LAYOUT-2) or a `layout` manifest (§12.1).
- `ctx.config` is the render's resolved config (M3.5, D153). A layout plugin reads its own fragment's keys there, for example `ctx.config.elk`, with the fragment's defaults merged in.
- Text output (`format: 'ascii'`) always lays out with `layered` and the cell profile (D179): `mermaid` never loads or runs another engine for it, whatever `layout` names, and says so with one `ASCII_DROPPED` warning (`feature: 'layout'`) instead of `ELK_NOT_INSTALLED` or `LAYOUT_UNKNOWN`. No other engine honours `grid`.

**ELK (M3.5, D171–D174).** `@mermaid-js/layout-elk` is the optional ELK engine (§12.1). It keeps v12's name and nine layout names: `elk` and `elk.layered` (ELK layered), `elk.stress`, `elk.force`, `elk.mrtree`, `elk.sporeOverlap`, `elk.box`, `elk.rectpacking`, `elk.radial`. It changes no default (D127, R-LAYOUT-7).

- **Synchronous (D172).** elkjs's bundled build lays out synchronously behind a `setTimeout`; the package calls its dispatcher in-process (`layoutSync`, no worker, no timer), so the engine is an ordinary `LayoutEngine` and `renderSync` works after `prepare()`. elkjs (0.12.0, v12 develop's version) loads with the engine, only for a diagram that names an ELK layout. Its GWT `$H` hash counters differ run to run and are never read.
- **Adapter (D174).** A port of v12 develop's `LayoutData → ELK graph` mapping, from `LayoutGraph`: each edge lives in its ends' common ancestor; a group with its own `direction` is laid out on its own (`SEPARATE_CHILDREN`) unless an edge crosses it, which puts every group on the way under `INCLUDE_CHILDREN`; v12's fixed options; title bands reserved as a minimum size; end labels grown by their marker. Read-back uses root coordinates; an edge an algorithm leaves unrouted runs straight between the borders, and only `layered` places edge labels. Every `elk.*` key, the presets and the `straightenEdges`, `orientFeedbackEdges` and `keepEntryNodeOnTop` passes are ported with v12 develop's defaults. Parity is with v12's options and DDLT invariants, not its pixels. Spacing comes from `LayoutGraph.spacing`.
- **Not applied (D174).** `LayoutGroup.algorithm` (flowchart `id@{ algorithm }`) reaches the engine as written, but the group is laid out with the diagram's algorithm; `mermaid` warns `ELK_ALGORITHM_IGNORED` once per render. `MODEL_ORDER` cycle breaking is left off a group ELK lays out with its parent (elkjs 0.12 throws there).
- **Warnings.** The engine has no warning channel: it notes what it could not do (`elk.radial` on a graph ELK calls not a tree, drawn with `layered`: `ELK_RADIAL_NOT_A_TREE`) and the package's extension turns the notes into warnings in `postLayout`. `ELK_NOT_INSTALLED` (an ELK name with no ELK engine registered, D173) and `ELK_ALGORITHM_IGNORED` come from `mermaid`, which is allowed to name the package; core names no plugin (D153).
- **`lineHops`** is a `postRender` edit by the package's extension on the compact tree (§7.1): crossings of straight runs get an arc or a gap. Running it puts ELK renders on the tree writer; other renders keep the stream writer (§12.1).

### 6.3 Text output: unit profile, grid and the text-grid kit (M2, D76–D87)

**Unit profile (D77).** A cell measurer alone does not give a layout in cells: the graph builder and the engine also use length constants. Every one of them comes from an injected `UnitProfile`, carried in `RenderContext.units` next to `measurer`:

```ts
interface UnitProfile {
  readonly id: 'px' | 'cell';                  // part of the determinism key (R-ARCH-6)
  readonly pxPerUnit: { x: number; y: number }; // px: 1 × 1; cell: 8 × 16 (converts px config values)
  readonly builder: {                           // read by the diagram's graph builder
    nodePad: { x: number; y: number }; groupPad: number; titlePad: number;
    labelPatch: { x: number; y: number }; headRoom: number; wrapWidth: number; edgeWrap: number;
    spacing: LayoutSpacing; minSpacing: LayoutSpacing; diagramPadding: number; // defaults, minimums
  };
  readonly engine: LayoutMetrics;               // passed through LayoutGraph.metrics
  readonly grid?: number;                       // grid quantum, 1 for cells
}
interface LayoutMetrics {                       // today's layered constants; px values are the current ones
  portPitch: number; minPitch: number; portSep: number; trackMargin: number; trackPitch: number; trackSpread: number;
  levelMargin: number; levelPitch: number; levelLead: number; levelClear: number; levelTouch: number;
  snap: number; bendSnap: number; leanClear: number; fan: number; loop: number; loopGap: number;
  loopLabel: number; corner: number; turnBreakpoint: number;
}
```

- `LayoutGraph` gains `metrics?: LayoutMetrics` (defaults to the px values, so callers that don't pass it keep today's output) and `grid?: number`. With `grid` set, the engine rounds node centres, box edges, ports and tracks to whole multiples of it; odd and even box widths are handled so the box edges, not the centre, land on the grid. In grid mode each edge end gets its own cell on its side, off the corners and at a port pitch of 2; a side with more ends than that grows (wider for top and bottom, taller for left and right) and `LayoutModel` reports the grown size. Ends are never bundled (D140). The builder pre-sizes boxes from edge counts per side so growth is rare.
- The px profile reproduces today's numbers exactly: introducing it must not change one SVG byte.
- Shape geometry: with the px profile the builder sizes nodes with the flowchart's `shapeSize`; with the cell profile every shape is a text-form box (label + 2·`nodePad.x` + 2 wide, lines + 2·`nodePad.y` + 2 high), because the text forms (D82) are all boxes. This is the one place the builder branches on `units.id`.
- Config px values (`nodeSpacing`, `rankSpacing`, `wrappingWidth`, `diagramPadding`) are divided by `pxPerUnit` and clamped to a minimum (node spacing ≥ 2, rank spacing ≥ 3 cells).
- Cell profile, `ascii.padding: 'compact'` (default): node box label + 4 wide × lines + 2 high; node spacing 2, rank spacing 4, edge spacing 1; label patch label + 2; group padding 1; title band 0 (the title sits on the top border); head room 1. `'roomy'` gives mermaid-ascii-like spacing (box padding 1 each way, gaps of 5).

**Drawing (D76).** A diagram that supports ASCII draws in its `ascii` hook with the text-grid kit in `@mermaid-js/core/ascii`:

| Piece | Role |
| --- | --- |
| `cellMeasurer` | `Measurer` over grapheme clusters (`Intl.Segmenter`): East Asian Wide/Fullwidth and emoji 2, combining marks and ZWJ 0; `metrics().lineHeight` = 1 (D81) |
| `Canvas` | rows × columns of cells; a wide grapheme takes its cell and a continuation cell; `toString()` trims trailing spaces |
| `GlyphSet` | `unicode` and `ascii` tables for lines (solid, dotted, thick), corners, tees, heads (`▲▼◄►`/`^v<>`, `●`/`o`, `✕`/`x`) (D79) |
| `junction(a, b)` | one lookup that merges any two line glyphs, heavy and dashed included |
| `snapRoute(points, grid)` | `RoutePoint[]` → cell polyline |
| `repairRoute` | A\* over free cells, Manhattan + turn penalty, for segments that hit a box, label, frame or another edge after snapping (D78) |
| `drawBox`, `drawText` | box forms (square, rounded, double side, `═` caps) and cell text |

Ported from mermaid-ascii's canvas, glyph, junction and cell-text code (MIT, attribution in headers and `THIRD_PARTY_NOTICES`); its placement, router and parser are not (research/mermaid-ascii.md §8.11).

**Flowchart `ascii` entry.** `@mermaid-js/diagram-flowchart/ascii` exports the hook. The manifest names it (`"ascii": "./dist/ascii.js"`) and lists `"formats": ["svg", "ascii"]`; `prepare` loads it only for `format: 'ascii'`. Pipeline: `prepare(model)` with `ctx.units = cellProfile`, `ctx.measurer = cellMeasurer`, `routing: 'stepped'`, `grid: 1` → layered engine → snap and repair → draw groups (outermost first, title on the top border), edges, edge labels on their longest straight segment, nodes through the shape → text-form table, front-matter title on line 1 → `Canvas.toString()`.

**What is dropped (D82).** Colours and styles, curves, images/icons (label kept), bold/italic, links/tooltips/callbacks, accTitle/accDescr: one `ASCII_DROPPED { feature, astIds }` warning per feature kind; shapes outside the table: one `ASCII_SHAPE` warning; edges the repair router finds no free lane for: one `ASCII_ROUTE { astIds }` warning (D78). Width: `ascii.maxWidth` → `availableWidth` in cells; never cropped; `ASCII_TOO_WIDE` (D84).

**Config (`ascii` section, `x-mermaid` status `honoured` since M2):** `charset: 'unicode' | 'ascii'`, `padding: 'compact' | 'roomy'`, `maxWidth?: number`. Diagram text may set all three.

**Hooks (D86).** `postParse` and `postLayout` run; `LaidOut` gains `units: 'px' | 'cell'`. No `postRender` or `afterMount`. The DOM adapter stays SVG-only in M2.

**CLI (D85).** `packages/mermaid` gets a `bin` `mermaid`: `mermaid render [file|-] --format ascii|svg [--charset ascii] [--width N|auto] [--warnings]`. Table measurer, stdout output, diagnostics to stderr, exit 1 on error (a `--format` other than `ascii|svg` is a usage error) and 2 on `UNSUPPORTED_FORMAT`. `--charset` and `--width` are explicit text options (`TextRenderOptions.ascii`): they win over `ascii.*` from the diagram text. No runtime dependencies (R-PERF-2).

**Tests (D83, D87).** `packages/conformance/ascii/` holds the 142 ported mermaid-ascii fixtures (`input.mmd`, `upstream.txt`, `expected.txt`, header metadata) and `ascii-divergences.json`; corpus-wide ASCII render properties in both charsets; a size check for kit + entry (≤ 15 KB gz) and a bundle test that an SVG flowchart never loads them.

**M2 work breakdown** (tickets under the M2 spec issue):

| # | Work item | R-ids | Depends |
| --- | --- | --- | --- |
| 1 | Grid-snapping prototype: cell-unit `LayoutGraph`s from the ported fixtures through today's engine with `stepped`, snap, report collisions (throwaway, answers how much repair is needed) | R-ASCII-1 | – (uses M1 code as is) |
| 2 | Port the 142 mermaid-ascii fixtures: `input.mmd` + `upstream.txt` + metadata, attribution, rejected/reinterpreted triage | R-ASCII-2 | – |
| 3 | `UnitProfile` + `LayoutMetrics` in core; px profile = today's constants; `RenderContext.units` | R-ARCH-3 | M1 #9, #11 |
| 4 | Layered engine reads `LayoutGraph.metrics` and honours `grid` | R-ARCH-3, R-ASCII-1 | 3, M1 #11 |
| 5 | Flowchart graph builder takes every constant from `ctx.units` | R-ARCH-3 | 3, M1 #14 |
| 6 | `core/ascii` kit: canvas, glyph sets, junction merge, box/text drawing, cell measurer | R-ASCII-6, -7 | M1 #2, #9 |
| 7 | Route snapping + repair router | R-ASCII-1 | 4, 6 |
| 8 | Flowchart `ascii` entry: shapes table, edges, labels, subgraphs, title, drop warnings | R-ASCII-1, -5 | 5, 7, M1 #8 |
| 9 | API: `format: 'ascii'`, `TextRenderResult`, lazy ascii entry, `ascii` config section, `UnsupportedFormatError` paths, `LaidOut.units` | R-ASCII-4, -5, -8 | 8, M1 #7, #15, #22 |
| 10 | Golden suite: our `expected.txt`, upstream structural check, `ascii-divergences.json`, corpus properties both charsets | R-ASCII-2, -9 | 2, 8 |
| 11 | `mermaid` CLI bin | R-ASCII-4 | 9 |
| 12 | Size budget + bundle test, generated type × format matrix, ASCII docs page | R-ASCII-5, -9 | 9, M1 #3 |

### 6.2 `layered` engine (`core/layout/layered`): port per O-7

O-7 is decided (2026-11-02): **port**. Pele's layered layout is ported into core and owned by us, with MIT attribution (R-REL). It is not a dependency on Pele's package, because R-PERF-2 forbids runtime dependencies and the changes listed below (v12 config values, `minLen`, routes as data, determinism) need control over the code. The trade-off we accept: upstream Pele fixes don't arrive for free and have to be brought over by hand.

This is a port of Pele's `layout/layered.ts` and `layout/compound.ts`, with attribution and Pele's ranked aesthetic-goal header kept:

- DFS cycle removal in declaration order;
- longest-path ranking with a balancing pass, giving labelled edges a middle rank;
- dummy nodes, capped;
- barycenter sweeps run both ways, keeping the order closest to the declaration;
- Brandes-Köpf placement;
- post-passes: spread, settle, snap, straighten, track assignment;
- compound layout: each group is laid out in its own direction and placed as a box with border ports; a crossed group inherits its parent's direction, as in v12;
- typed arrays and CSR adjacency throughout.

What changes in the port:

1. Config values (spacing, padding) come from `ResolvedConfig`, using v12's defaults (R-LAYOUT-6, P1). Pele's constants don't apply.
2. `minLen` from `---->`-style edges is honoured, matching v12.
3. Edge routes are returned as data. Path strings are built in the renderer, so ASCII can reuse the routes.
4. `availableWidth` (opt-in) uses Pele's `tighten`, then `turnToFit` (R-LAYOUT-5).

The engine is checked with DDLT-style tests on `LayoutGraph` fixtures captured from the corpus. They check validity (no overlaps, no NaN, groups contain their children) and crossing counts. Fixtures are produced by the v13 parser and table measurer, so they're always fresh.

## 7. SVG output (R-SVG-*, R-SEC-2, D6, D35)

### 7.1 SvgWriter: reading of D35 and D52

D35 says plugins return an "SvgNode tree" so escaping is guaranteed, and D52 adds a `postRender(svgTree)` hook that edits that tree before serialisation. A tree of objects costs allocations on large diagrams, while Pele's string building is a large part of its speed. This design keeps both guarantees with one writer API and two backings: **[ADR-3]**

- Plugins always write through a **typed writer**, the *only* way to produce markup.
- When no `postRender` hook is registered (the common case), the writer **streams** straight into a string buffer.
- When a `postRender` hook is registered, the same calls build a **compact tree** (flat parallel arrays: tag, attribute slice, parent, first child, next sibling), wrapped by an `SvgTree` view with `find`, `setAttr`, `append` and `remove`. Hooks edit the tree through that view, which accepts only allowed tags and attributes, and then the tree is serialised.

Both backings produce byte-identical output for the same calls; a test runs the corpus through both.

```ts
interface SvgWriter {
  open(tag: AllowedTag, attrs?: Attrs): void;        // AllowedTag = 'g'|'path'|'rect'|'circle'|'ellipse'|'polygon'|'line'|'text'|'tspan'|'a'|'title'|'desc'|'image'
  close(): void;
  leaf(tag: AllowedTag, attrs?: Attrs): void;
  text(content: string): void;                       // always escaped
  label(box: LabelBox, x: number, y: number, attrs?: Attrs): void;
  path(): PathBuilder;                               // numbers formatted via num(); returns d-string token, not a raw string
}
type Attrs = Partial<Record<AllowedAttr, string | number | ThemeRef | SafeUrl>>;
```

- Tag and attribute names are compile-time unions taken from the security allow-list, which is the same list R-SEC-2 tests. A plugin cannot emit `<script>`, `on*` or `foreignObject`, because those types don't exist.
- Values are escaped in `finish`. URLs must be `SafeUrl`, a branded type produced only by `checkUrl()` (R-SEC-4). Colours from user styles must be `SafeColor`, produced only by the style allow-list (R-SEC-3).
- Output is a string buffer. `num()` uses integer-table formatting to 2 decimals, the fast-path escape is taken from Pele, and there are no `<defs>` or `<marker>`: arrowheads are inline paths, so no ids are needed.
- Element ids: only `${idPrefix}-title` / `-desc` (R-A11Y-1). Everything else uses `data-id`, `data-ast` (§4.2) and classes (R-SVG-2, -3).
- Links (R-SVG-4, D62): `<a href>` takes a `SafeUrl`. The v12 `target` (`_self`, `_blank`, `_parent`, `_top`) is kept; any other value is dropped with a warning, and `_blank` always adds `rel="noopener noreferrer"`. The URL check follows `securityLevel` (§10).

### 7.2 Document root

```
<svg xmlns=… viewBox=… width=… role="img" aria-roledescription="flowchart" aria-labelledby="{p}-title" aria-describedby="{p}-desc"
     class="mermaid mermaid-flowchart" data-mermaid-version="13.x"
     style="max-width:{w}px; --_pf:var(--mermaid-primaryColor,#ECECFF); …only aliases actually used…">
  <title id="{p}-title">…</title><desc id="{p}-desc">…</desc>
  <g class="clusters">…</g><g class="edgePaths">…</g><g class="edgeLabels">…</g><g class="nodes">…</g>
</svg>
```

- Group class names follow v12 (`nodes`, `edgePaths`, `edgeLabels`, `clusters`, `node`, `edge`, `cluster`, plus user `classDef` classes) where possible. This reduces breakage for integrators who style or query the SVG (P1). The element structure may change, but only for a stated reason (for example, inline arrowheads instead of `<marker>`). Each change and its reason is listed in MIGRATION.md.
- `useMaxWidth` keeps its v12 meaning (R-SVG-7).

## 8. Theming (R-THEME-*, D20, D39)

### 8.1 Model

```
themeVariables (config)  ──►  ThemeSpec  ──►  root style aliases  ──►  elements reference aliases
  base vars (≤ 8)             { base: {…},       --_pf: var(--mermaid-primaryColor, #ECECFF);
  + any explicit override       derived: {…} }    --_pb: var(--mermaid-primaryBorderColor,
                                                    color-mix(in srgb, var(--_pf) 85%, black));
```

1. **Built-in themes**: **all 11 v12 themes are kept** (R-THEME-6, R-THEME-7 Must; O-2 resolved 2026-11-02). 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`; D151) and `default`, `dark`, `forest`, `neutral` and `base`. The remaining v12 themes (`neo`, `neo-dark`) follow by M3.5 (D106); until then they stand in for `redux-color` and `redux-dark-color` with a warning. Each theme is a `ThemeSpec` data file: a table of base values plus a derivation table, not a class with khroma code. Adding a theme is cheap, so all of them live in core. Each is its own lazily imported file, so an unused theme costs no bundle size. **`redux-color` is the default** when no theme is set (R-THEME-6, D151).
   - A `ThemeSpec` also carries **shape tokens**, not only colours: stroke widths, corner radii, font weights and sizes, and spacing steps. Diagram renderers read sizes from these tokens instead of hard-coding them, so every diagram type rendered in redux looks like one family (R-THEME-11). Tokens are exposed as CSS variables like the colours (`--mermaid-strokeWidth`, `--mermaid-radius`, …).
   - The redux palette and tokens are taken from the v12 redux themes (`redux`, `redux-dark`, and their colour variants), so P1 applies to them like the others.
   - Every difference between the redux and classic theme families is theme data (D152): palette (`borderColorArray`, `bkgColorArray`), arrowhead size and gap, shape padding and `dropShadow`. The redux themes carry v12 `look: neo` geometry, the classic themes v12 classic geometry, and no renderer checks a theme name or a look. `look` itself is removed (D153). Geometry tokens are read as numbers at render time because they feed layout; values are in MIGRATION.md, Theme geometry.
2. **Derivation rules** are expressions in a tiny DSL: `mix(primaryColor, black, 15%)`, `contrast(primaryColor)`, `invert(…)`. Each rule compiles to two things: a CSS expression (`color-mix(in srgb, …)`, or relative colour syntax for `contrast`/`invert`), and a JS-computed fallback value, from the same formula in `core/theme/color.ts` (sRGB mixing, WCAG luminance; about 1 KB). Using `in srgb` means the JS fallback and the browser result are **numerically identical**, so `deterministic` output stays exact.
   - **Live contrast (R-THEME-4).** `invert(a)` is `color(from a srgb calc(1 - r) …)`. `contrast(bg, a, b)` reads bg's WCAG luminance in the browser (`color(from bg srgb-linear …)`, exact WCAG weights) and compares it with thresholds precomputed from the two inks (AA either side of a, and the midpoint where a's ratio beats b's), so the ink flips when a host overrides the background's base variable. Equal to the JS choice except within 1e-9 of a threshold. **Limits:** CSS can't pick between two *live* colours, so the inks are the theme's resolved values (a host override of `--mermaid-textColor` doesn't reach `nodeTextColor`; set that variable directly), and bg's own alpha is ignored (JS composites it over `background`). Relative colour syntax is in every evergreen engine of the last two years (R-ARCH-8); an older engine drops the declaration.
3. **Matching v12's colours.** v12 derives with khroma's `darken`/`lighten`/`adjust` in HSL. A `color-mix` in sRGB doesn't reproduce those exactly. Rules are chosen to resemble v12's derived colours, with values from `mermaid@12` as the reference. There is no automated colour-match test: all diagrams, colours included, are reviewed by hand at the end of the process. Exact equality isn't required (P2), but resemblance is (R-THEME-6). WCAG AA contrast (R-THEME-9) is still checked automatically, because that is a requirement in its own right. **[ADR-4]**
4. **Precedence when resolving:** a `themeVariables` key set explicitly by the author is used as a literal fallback, and the CSS var still wins; otherwise the derived rule is used. The CSS variable name is always `--mermaid-<v12 name>` (R-THEME-2).
5. **Alias layer:** short private aliases (`--_pf`) keep output small, and only the aliases actually used are written to the root (from Pele).
6. **`theme: 'auto'`** (Could): emits a `<style>` containing only `@media (prefers-color-scheme: dark){ svg[data-p="{p}"]{ --mermaid-…: … } }` from the dark spec. The allow-list test permits `<style>` only in this mode, and only with variable declarations.

### 8.2 Non-browser consumers

`fill="var(--_pf)"` works in browsers. resvg, librsvg, Inkscape and some image proxies don't resolve CSS variables. This design adds `output.cssVariables: false` (integrator option), which emits the computed literal colours instead. The output is then still themed, but can't be re-themed by host CSS. The default is `true`. **[ADR-4]**

### 8.3 Inventory (O-1)

`tools/gen-config` extracts every theme variable read by the ported diagrams and builds a table: name, base/derived, rule, used-by. Until a diagram is ported, its variables are accepted but unused (R-CONF-5). Numbered palettes (`pie1…12`, `git0…7`, `cScale0…11`) become `--mermaid-pie1` and so on, each derived from base variables in the same way.

## 9. Configuration (R-CONF-*, D22, D42)

- **Schema stays the source of truth:** `config.schema.yaml` is moved to `packages/core/schema/` and keeps every v12 key except the removed ones (R-CONF-1). `config.type.ts` is still generated from it.
- **Defaults are split by owner:** `tools/gen-config` writes the top-level defaults into core and each diagram section's defaults into its package. A flowchart bundle doesn't carry the defaults of 30 other diagrams.
- **Resolution:** `resolveConfig()` deep-merges in v12's order: defaults → initialize → front matter → directives (R-CONF-3).
  - The secure-key filter is applied to front matter and directives.
  - Unknown and removed keys go to `ctx.warn` (R-CONF-2).
  - This replaces v12's per-call deep cloning, the cost #8635 measured.
- **Lifecycle: resolved early, then frozen.** Config is settled before the diagram body is parsed: `preprocess` extracts front matter and `%%{init}%%` directives, `resolveConfig` merges them (plugin section defaults included, once detect has named the plugin) and deep-freezes the result. From that point it is read-only for the rest of the call:
  - Parse, layout, render and every hook receive the frozen object through `ctx`. Nothing downstream can write config: no `setConfig` / `updateSiteConfig` from diagram code, as v12 allowed.
  - Frozen means shared by reference, never cloned per stage or per call: reads are plain property reads, and a hostile or buggy plugin cannot change what later stages see.
  - `prepare` caches the frozen config with the parse result; `renderSync` reuses it, keyed on text plus the defaults snapshot.
  - `initialize()` swaps in a new frozen defaults object instead of mutating the old one, so a render already in flight keeps the snapshot it started with.
- **Integrator-only options** never come from diagram text: limits, measurer, `deterministic`, `output.cssVariables`, `idPrefix`, `securityLevel`, link schemes (R-SEC-5, R-SEC-6).
- **Config reference doc (R-CONF-4, D60):** generated from the JSON schema alone. Each key in `config.schema.yaml` carries an `x-mermaid` annotation: `{ status: honoured | ignored | pending | removed | moved, since?: '13.0.0', movedTo?: '@mermaid-js/plugin-interactions', replacement?: string, reason?: string }`. CI fails if the generated doc is stale or a key has no annotation. MIGRATION.md's config section is generated from the same data. Click-callback keys are `moved` to the interactions plugin (R-CONF-1).

## 10. Security (R-SEC-*)

| Threat | Control | Where |
| --- | --- | --- |
| Markup injection via labels | Labels are text runs and every value is escaped by the writer. No HTML mode exists. | §5.3, §7.1 |
| Script / event handlers | Tag and attr unions exclude them; property test over corpus + ported v12 XSS pages | §7.1, R-SEC-2 |
| CSS injection via `style`/`classDef`/`linkStyle` | Property allow-list; values matching `url( expression( javascript: @import image-set /* [<>{};\\]` are dropped; output as presentation attrs (`SafeColor`, `SafeLength`) | `core/svg/style.ts` |
| Malicious links | `checkUrl`: control-char/entity stripping (port of the `sanitize-url` logic), scheme allow-list on raw + decoded form, `//host` blocked; `_blank` gets `rel="noopener noreferrer"`. Default `securityLevel`: http, https, mailto, relative. `strict`: relative only. `loose`/`antiscript`/`sandbox` map to default with a warning (R-SEC-4, R-SEC-6) | `core/svg/url.ts` |
| Extension plugins (`postRender`) | The `SvgTree` view only accepts allowed tags, attributes and branded values, and the allow-list check runs after all hooks (R-PLUG-2) | `core/svg/tree.ts` |
| Click callbacks | Not in core output. The interactions plugin binds them in the DOM after mount, only when the integrator installed it; diagram text cannot turn it on (R-PLUG-9) | `plugin-interactions` |
| Theme-variable injection | `safeColor`: charset + function allow-list (`rgb hsl lab oklch color-mix light-dark var(--mermaid-*)`) | `core/theme` |
| DoS: input size, edges, nesting, output size | Limits in `RenderContext`, integrator-only; `RangeError` → `LIMIT` error | `core/limits.ts` |
| DoS: ReDoS | Linear scanners; regex lint; stress suite (50k runs, 1000-deep nesting, unclosed constructs) | parser kit |
| Prototype pollution | YAML/JSON merge skips `__proto__`, `constructor`, `prototype` | `core/config` |

Integrators should not need a sanitizer either (R-SEC-1, D61): the output is meant to be safe to insert as-is. This claim is verified before the first alpha (A-3): an external security review, the v12 XSS/GHSA corpus and fuzzing green, and a threat model covering plugins, theme variables, links and (if A-1 lands) image URLs.

## 11. Errors (R-ERR-*)

```ts
class MermaidError extends Error {
  code: 'SYNTAX' | 'SEMANTIC' | 'UNSUPPORTED_DIAGRAM' | 'UNSUPPORTED_FORMAT' | 'NOT_LOADED' | 'LIMIT' | 'INTERNAL';
  line: number; column: number; offset: number; length: number;   // original source, 1-based line/col
  expected?: string[]; diagnostics: Diagnostic[];                   // all diagnostics, first is primary
  limit?: 'maxSourceLength' | 'maxEdges' | 'maxNodes' | 'maxDepth' | 'maxOutputLength'; // code LIMIT
}
```

`NotLoadedError` (`code: 'NOT_LOADED'`, `missing: Resource[]`) and `UnsupportedFormatError` (`code: 'UNSUPPORTED_FORMAT'`) are subclasses.

**Messages (R-ERR-2, R-ERR-5, D50).** Messages are written for authors, not parser developers:

- They name the construct in Mermaid terms ("unclosed node label started at line 3"), never a token kind or grammar rule. The `Expected` table (§4.2) maps every token kind to a human name, and a test fails if a message contains a raw token or rule name.
- They add a fix hint where the cause is clear ("add `end` to close the subgraph opened at line 2").
- They include the snippet with a caret, at most 5 grouped expectations, and the opener's position for unclosed constructs.
- The error corpus in `diagram-flowchart/test/errors/` is snapshotted with v12's message next to v13's, and reviewed; the bar is "clearly better than v12".

**Error image (R-ERR-3, D49).** Behaviour matches v12. `render()` rejects with `MermaidError`, and unless `suppressErrorRendering` is set, the DOM adapter puts an error image where the diagram would be. `run()` catches per diagram and carries on with the rest. The error image is an SVG built by core's `renderErrorSvg(error, ctx)` through the same `SvgWriter`, so it is themed and inside the allow-list; the message is escaped text.

## 12. Plugins and discovery (R-PLUG-*, D35, D40, D41)

There are two kinds of plugin, both pure: **diagram** plugins (one diagram type each) and **extension** plugins (hooks that apply to any type) (R-PLUG-2, D52).

### 12.1 Diagram plugins

```ts
interface DiagramPlugin<M = unknown, L = LayoutModel> {
  id: string;                                   // 'flowchart'
  aliases?: string[];                           // 'graph', 'flowchart-v2', 'flowchart-elk'
  detector: (text: string, config: ResolvedConfig) => boolean;
  formats: ('svg' | 'ascii')[];                 // R-ASCII-5; also in the manifest
  layoutKind: 'graph' | 'custom';               // 'graph' requires L = LayoutModel (§6.1)
  parse(text: string, ctx: RenderContext): ParseResult<M>;
  resources?(ast: AstNode, ctx: RenderContext): Resource[];   // icon packs, math, layout engine (R-API-2)
  labels?(model: M): readonly string[];         // label texts as written, so an extension scans only labels for its delimiter (D176, D178)
  layout?(model: M, ctx: RenderContext): L;     // graph: may use ctx.layout(graph); custom: own algorithm
  render(model: M, layout: L, ctx: RenderContext, w: SvgWriter): void;
  ascii?(model: M, layout: L, ctx: RenderContext): string;   // M2: lazily loaded entry, draws with core/ascii (§6.3)
  configDefaults?: object;                      // its schema section defaults
  themeVariables?: ThemeRuleTable;              // its derived vars
}
// e.g. DiagramPlugin<SankeyModel, SankeyLayout>: columns, node bands, link ribbons
```

**Manifest** in the plugin's `package.json`:

```json
"mermaid": { "plugin": "diagram", "id": "gantt", "formats": ["svg"], "detector": "./dist/detector.js", "entry": "./dist/index.js" }
"mermaid": { "plugin": "diagram", "id": "flowchart", "formats": ["svg", "ascii"], "detector": "…", "entry": "…", "ascii": "./dist/ascii.js" }
"mermaid": { "plugin": "extension", "id": "interactions", "entry": "./dist/index.js" }
"mermaid": { "plugin": "layout", "names": ["elk", "elk.stress"], "entry": "./dist/index.js", "config": "./dist/config.js" }
```

`plugin` is the kind. Extension manifests have no detector; the entry is loaded when the plugin is activated (on discovery, or through `registerExternalDiagrams`).

**Layout manifests (M3.5, D177).** `names` is required and non-empty, and never claims the built-in `layered` or `dagre` (D127, D171); `entry` is required, and `id`, `export` and `config` are optional; a layout has no `detector`, `formats` or `ascii`. Activation registers each name lazily, as `registerLayoutLoaders` does. The entry loads once, when a diagram first names one of the layouts. Its export (`export`, else the default export) is either v12's `LayoutLoader[]`, looked up by name, or one engine that serves every name. `config` names a small module whose `config` (else default) export is the package's config fragment. It is loaded eagerly with the manifest, like a detector, so the keys are known before the entry loads. Through `registerExternalDiagrams` the caller passes it as `ManifestPlugin.config`, and a manifest with `config` but no fragment is refused.

**Layout loaders (R-LAYOUT-2, M3.5).** `registerLayoutLoaders` takes v12's `{ name, loader }[]`; the loader resolves to a `LayoutEngine` (or a module with `layout`/`default`). M3.5 adds two optional fields, shared by every loader of one package: `config`, its config fragment (below), known from registration on; and `extension`, an `ExtensionPlugin` that runs only on renders laid out by one of that package's names, through a per-render runner of the registered extensions plus it, so every other render keeps the stream writer. `@mermaid-js/layout-elk`'s default export is such a `LayoutLoader[]` (nine names, one `elk` fragment, one extension for `lineHops` and its warnings, §6.1). Activation on install waits for #218's discovery, so the package has no `layout` manifest yet and is registered explicitly. The manifest it will carry is `{ "plugin": "layout", "names": [the nine], "entry": "./dist/index.js" }` plus a `config` module; a discovered package gets no `extension` until the manifest can name one.

**Config fragments (M3.5, D153).** A plugin can declare a `ConfigFragment` (`@mermaid-js/core/config`): `{ id, keys, defaults?, aliases?, themeVariables? }`. `keys` is a key tree like core's generated one. `defaults` merge over core's defaults and below everything else. Each alias `{ from, to, when?, value? }` moves a legacy key (for example `look: handDrawn`) to the plugin's key in each config source, before the schema check. A source that also sets `to` keeps its own value. `themeVariables` are new theme variables with a default rule or value; reusing a name core already has is refused. So are top-level keys core's schema has, defaults outside the fragment's own keys, and aliases from or to a secure or integrator-only key. An extension carries its fragment as `ExtensionPlugin.config`, a layout as `LayoutLoader.config` or the manifest's `config` module. The fragment counts from registration on, one per `id`. Its keys validate only while the plugin is registered, and are unknown keys otherwise. Core never names a plugin. A package keeps its fragment as `schema/config.fragment.yaml`, an annotated schema with an `x-mermaid-fragment: { id, aliases?, themeVariables? }` header. `pnpm gen:config` turns it into `src/generated/config-fragment.ts` (`configFragment`) and documents the keys in a "plugin" section of the config reference. A fragment may not reuse a key core's schema has.

**Formats (R-ASCII-5, D58).** `supportsFormat(type, format)` reads `formats` from the manifest, so hosts can check without loading the package. A type supports ASCII through an `ascii` hook, or by being graph-based on the shared layout. Asking for an unsupported format throws `UnsupportedFormatError`, never an approximation. The docs' type × format matrix is generated from the manifests.

### 12.2 Extension plugins and hooks

```ts
type LaidOut =
  | { kind: 'graph'; diagram: string; layout: LayoutModel; units: 'px' | 'cell' }   // units: M2 (D86)
  | { kind: 'custom'; diagram: string; layout: unknown; units: 'px' | 'cell' };

interface ExtensionPlugin {
  id: string;
  postParse?(ast: AstNode, ctx: RenderContext): AstNode;
  postLayout?(l: LaidOut, ctx: RenderContext): LaidOut;      // must return the same kind
  postRender?(tree: SvgTree, ctx: RenderContext): void;        // edits in place, before serialisation (§7.1)
  afterMount?(el: Element, result: RenderResult): void;         // DOM adapter only
  claims?: ('callbacks')[];                                    // features it handles, to silence core's warning
  inline?: InlineProvider[];                                   // M3.5 (D177): boxes for delimited label spans (§5.3)
  resources?: {                                                // M3.5 (D178): what it loads lazily (R-API-2)
    provides: Resource[];                                      // preload({ math: true }) loads those of kind 'math'
    missing(parse: ParseResult, req: { config, format }): Resource[];   // sync; prepare loads them, renderSync throws
    load(r: Resource): Promise<void>;
  };
  config?: ConfigFragment;                                     // M3.5 (D153): its own config keys (§12.1)
}
interface InlineProvider {
  open: string; close: string;                                 // '$$', '$$'
  box(source: string, req: { font, measurer, metrics, ex, warn }): InlineBox | undefined;  // sync; undefined = as written
}
type InlineBox = { width: number; height: number; baseline: number; node: SvgFragment };     // px
```

- Hooks run in registration order. Each gets the frozen context, so they can't change config.
- `postLayout` hooks that only understand graphs act on `kind: 'graph'` and pass other layouts through unchanged. A hook written for one diagram type checks `diagram`. The runner rejects a hook result whose `kind` differs from its input.
- `postRender` runs on the compact tree; core then re-checks the allow-list, so a hook can't introduce `<script>`, `on*` or unsafe URLs (R-SEC-2).
- `afterMount` exists only in `mermaid`'s DOM adapter (`run`, `mount`, `bindFunctions`). Core never calls DOM code.
- Inline providers (D177) are registered with the extension, synchronously, and run during label layout, so `box` is synchronous. An engine that loads lazily (math, D178) is a resource its extension asks `prepare()` for; until it has loaded the provider returns `undefined`. The first registered provider of a delimiter wins. The runner checks each box (finite sizes, a fragment node) and reports a throwing provider as `MermaidError('INTERNAL')` naming the extension, as for hooks.
- As built in M1: hooks get `HookContext` = the frozen `RenderContext` plus `diagram` (the plugin id) and `state`, the extension's own scratch object for that render, which `afterMount(el, result, state)` also gets (how `postParse` hands click callbacks to `afterMount`). Core's `HookRunner` runs the hooks; `RenderResult.bindFunctions` is set when an extension has `afterMount` and is the adapter's entry point. A failing hook, a changed `kind` or an allow-list failure after `postRender` rejects with `MermaidError('INTERNAL')` naming the extension.

### 12.3 Interactions plugin (R-PLUG-9, D47)

`@mermaid-js/plugin-interactions` restores v12 `click X callback` / `call` from M1. Core keeps callbacks in the model and emits `data-id`/`data-ast` on every node. The plugin:

- reads the callbacks from the parse result through `postParse` (and claims `callbacks`, so core doesn't warn);
- binds click handlers in `afterMount`, resolving function names the way v12 did. This includes looking names up on `window`, which is why it is opt-in by installation only and diagram text can't enable it;
- provides `RenderResult.bindFunctions`, so v12 call sites that call `bindFunctions(el)` after `render()` keep working.

Its config keys (moved from the core schema) live in its own schema section.

As built in M1: hooks see the AST, not the model, so the AST node of a `click … callback` / `call` statement carries `callback: AstCallback` (`{ targets, name, args? }`, from `@mermaid-js/core/parser-kit`); the plugin collects every such node in `postParse` into its `state` and binds `g.node[data-id]` elements in `afterMount`, once per element. v12 had no click-callback config keys (`securityLevel: loose` gated them), so the plugin has no schema section, and callbacks do not depend on `securityLevel`.

### 12.4 Discovery

**Discovery paths:**

| Environment | Mechanism |
| --- | --- |
| First-party, any env | `mermaid` depends on all `@mermaid-js/diagram-*`. A generated `registry.gen.ts` holds `{ id, detector (static import, tiny), load: () => import('@mermaid-js/diagram-x') }`. Bundlers code-split per type (R-PLUG-4). |
| Node / SSR, third-party | On first `render`, `mermaid/node` scans `node_modules` (`require.resolve` paths) for packages with a `mermaid.plugin` manifest, then caches the result. |
| Bundlers, third-party | `mermaid/plugin` (unplugin) does the same scan at build time and provides `virtual:mermaid-plugins`, which `mermaid` imports if present. |
| CDN | `dist/mermaid.esm.min.mjs` (ESM, a chunk per lazy module) and the classic loader `dist/mermaid.min.js` (D162). First-party chunks lazy-load from `cdnBase` (default: the directory `mermaid` itself was loaded from; `initialize({ cdnBase })`, or `data-cdn-base` on the `mermaid.min.js` tag, which loads the whole build from there, D163). Third-party scripts push themselves onto `globalThis.mermaidPlugins`, before or after `mermaid` (D167). Never loaded from diagram text (R-PLUG-7). |
| Explicit | `registerExternalDiagrams()` (R-PLUG-6). |

**Layout packages (M3.5, D177).** Every discovery path also takes `layout` manifests. Each name is registered as one lazy loader, with the package's config fragment loaded eagerly from the manifest's `config` module. An explicit `registerLayoutLoaders` call wins over discovery. A discovered `elk`/`elk.*` takes over the built-in aliases. When two discovered packages claim one name, the package name decides (D166). The discovery side of this belongs to #218.

**Detector order:** first-party detectors run first, in v12's registration order (detection order is part of "syntax is sacred"), then third-party detectors in discovery order. **[ADR-6]**

## 13. Testing architecture (R-TEST-*)

### 13.1 Parity oracle (`packages/conformance`)

```
corpus source ──► mermaid@12 (jsdom-free: parser + db only, via its diagram API) ──► normalise ──┐
            └───► v13 plugin.parse ──────────────────────────────────────────────────────────────────────────────► normalise ──┴─► deep-equal | divergences.json
```

- **Reference pattern:** the Chevrotain branch (`flow.parse-corpus.spec.ts` with `PARSE_FIXTURE_PATH`, `flow.db-parity.spec.ts` snapshot functions). The normaliser for flowchart is literally its `snapshotVertex` / `snapshotEdge` shape.
- **Tiers:**
  - PR CI: in-repo corpus (e2e `.mmd`, docs examples, ported spec strings, the 158-diagram bench corpus).
  - Nightly CI: fuzzing with a seeded mutator (from Pele's `tests/support/corpus.ts` approach).
  - QA, not CI: the external 10k+ set via `PARSE_FIXTURE_PATH`, run by quality assurance with the same runner (R-TEST-1, O-3). Where QA reads the set from is still open.
- **`divergences.json`:** `{ id, inputHash, kind: 'accept'|'reject'|'model', reason, owner, since }`. Unlisted divergences fail; listed ones that disappear fail too, so the list stays honest (R-COMPAT-4).
- **Oracle bump job:** a weekly workflow bumps `mermaid@12` and opens an issue per new failure cluster (R-COMPAT-8).

### 13.2 Render properties (vitest, every corpus input)

These run with `deterministic: true` and the table measurer:

- well-formed XML;
- the allow-list check (`assertInert`, tags/attrs/style props/URLs);
- determinism, by rendering twice;
- no `NaN`, `Infinity` or `undefined`;
- the bounding box contains all elements.

### 13.3 Visual

A Playwright/Argos baseline on a curated subset: per shape, per edge type, per theme, subgraph cases, and wrapping and CJK. It reuses the `e2e/` helpers and the `.mmd` auto-discovery (`mmd-snapshots.spec.ts`). The gallery page is built from the same fixtures (R-TEST-6).

### 13.4 Tooling tests

- **Recovery set:** multi-error documents, with an expected diagnostic list.
- **Symbols:** expected definitions and references derived from the oracle model, by node id, for every corpus input.
- **Grammar differential (R-PARSE-9):** the generated reference parser and the hand-written parser agree on accept/reject and AST shape over the corpus plus generated sentences.
- **AST round-trip (R-PARSE-8):** for every corpus input, every vertex, edge and subgraph maps to exactly one `data-ast` element and back to its source range.
- **Writer backings:** streaming and tree-backed `SvgWriter` give byte-identical output over the corpus (§7.1).
- **Fixture plugins:** a fixture extension plugin exercises every hook; a fixture diagram plugin covers manifest discovery and `supportsFormat`.

## 14. Performance plan (R-PERF-*)

**Size budget, core + flowchart ≤ 80 KB gz.** These are estimates, to be tracked from the first PR. Pele's whole core + flowchart is 57 KB gz, and its flowchart parser alone is 7.2 KB.

| Part | Budget (gz) |
| --- | --- |
| preprocess + YAML + config resolve + limits | 6 KB |
| parser kit | 2 KB |
| text: label layout + measurer + metric tables | 6 KB |
| layout: layered + compound | 18 KB |
| svg: writer + style/url/colour + theme specs (5) | 8 KB |
| flowchart: lexer/parser/model | 9 KB |
| flowchart: shapes (all v12 shapes) + edges + renderer | 16 KB |
| mermaid: API + registry + DOM adapter | 5 KB |
| **Total / headroom** | **70 KB / 10 KB** |

Shapes are the biggest risk, because v12 has 113 of them. If they go over budget, split rare shapes into a lazily loaded chunk. The tree-backed writer (§7.1) and the extension hook runner add an estimated 1–2 KB to core.

Only core has its own published size budget (R-PERF-8, D59). Later diagram packages are optional plugins and have none for now; R-PERF-1 still holds for core + flowchart.

**Speed:**

- **Per-stage timing:** `bench` wraps each stage with `performance.now()` behind a build flag that is compiled out of production (R-PERF-5).
- **Fixtures:** the #8635 / Pele set plus the 158-diagram corpus (R-PERF-6).
- **Regression baselines** are stored per runner (O-4).

**Rules carried over from Pele:**

- no work in module scope;
- typed arrays in layout;
- no per-call config cloning;
- lazy source-map and metric unpacking;
- fast-path escaping and labels.

## 15. Milestone M1 work breakdown (→ tickets)

| # | Work item | R-ids | Depends |
| --- | --- | --- | --- |
| 1 | Branch scaffolding: delete v12 sources, create packages, lint rules (DOM ban, import boundaries, console ban, regex lint), CI skeleton | R-ARCH-9, R-PLUG-1 | – |
| 2 | `bench` package from approaches harness + size/stage gates | R-PERF-1…7, R-TEST-7 | 1 |
| 3 | `conformance` package: oracle runner, normaliser API, divergences, `PARSE_FIXTURE_PATH` mode for QA's external corpus runs | R-COMPAT-2…4, R-TEST-1…3 | 1 |
| 4 | Preprocess (no text rewrites) + front-matter parser + YAML | R-COMPAT-6, R-PARSE-7 | 1 |
| 5 | Parser kit, AST types and ids | R-PARSE-2…5, -8 | 1 |
| 6 | Config: schema move, `x-mermaid` annotations, gen-config, resolveConfig, generated config reference | R-CONF-* | 1 |
| 7 | Flowchart lexer + parser + FlowModel + AST, oracle-green | R-COMPAT-2/3, R-PARSE-3/4/8 | 3,4,5 |
| 8 | Measurer interface + table measurer + gen-metrics + canvas measurer | R-TEXT-4…7, -9 | 1 |
| 9 | Label layout (markdown incl. bullets, HTML subset, wrapping) | R-TEXT-1…3, -8, -11 | 8 |
| 10 | Layered + compound layout port, DDLT-style tests | R-LAYOUT-1…6 | 1 |
| 11 | SvgWriter (streaming + tree backing, `SvgTree` view), url/style/colour safety, `securityLevel`, allow-list test | R-SVG-1, R-SEC-1…4, -6 | 1 |
| 12 | Theme specs incl. redux and shape tokens, derivation DSL, CSS vars | R-THEME-* | 11 |
| 13 | Flowchart renderer: shapes, edges, clusters, labels, links, `data-ast`, a11y | R-LAYOUT-4, R-SVG-*, R-A11Y-*, R-PARSE-8 | 7,9,10,11,12 |
| 14 | `mermaid` API: render/prepare/renderSync/preload/parse/initialize, Registry, errors and messages | R-API-1…5, R-ERR-* | 6,13 |
| 15 | DOM adapter: run, mount, error image, `afterMount` | R-API-6/7, R-ERR-3 | 14 |
| 16 | Limits + fuzz + stress suites | R-SEC-5, -7 | 7,13 |
| 17 | Visual baseline + gallery | R-TEST-5/6 | 13 |
| 18 | MIGRATION.md + generated config reference | R-COMPAT-9 | 6,14 |
| 19 | Release pipeline: changesets pre mode, private publish, public gate | R-REL-* | 2,14 |
| 20 | Flowchart grammar file + gen-grammar (reference parser, sentence generator, highlighters, syntax doc) + differential CI test | R-PARSE-9 | 5,7 |
| 21 | Extension plugin API: manifest `kind`, hook runner, fixture extension plugin | R-PLUG-2/3 | 11,14 |
| 22 | Interactions plugin: callbacks, `bindFunctions`, moved config keys | R-PLUG-9, R-SVG-5 | 15,21 |
| 23 | Non-graph contract check: a stub non-graph plugin (Sankey or pie) with its own layout type L and a postLayout fixture hook, in a type-level + runtime test, so the plugin API can't silently become flowchart-only | R-PLUG-1/2, R-ARCH-3 | 14, 21 |

R-COMPAT-10 (drop-in upgrade) and R-ASCII-5 are not M1 work: the first is release step two, the second lands with M2 (§6.3).

The parallel tracks after item 1:

- (2, 3), (4, 5, 6), 8→9, 10, 11→12 can all run side by side.
- Item 13 is the join point. 20 runs alongside 7; 21→22 follow 14/15.

## 16. ADRs to write

| ADR | Title | Status |
| --- | --- | --- |
| ADR-1 | Hand-written parsers with a parser kit; Chevrotain/jison as test oracles only | from D14 |
| ADR-2 | DOM-free core; measurement via injected `Measurer` | from D4, D17 |
| ADR-3 | Typed `SvgWriter` with a streaming backing and a compact tree backing (used only when `postRender` hooks exist) | **⚠ reading of D35, D52** |
| ADR-4 | Theme = v12 vocabulary as CSS vars; derivation DSL compiled to `color-mix(in srgb)` + identical JS fallback; `cssVariables:false` for non-browser consumers | from D20, D39, ⚠ §8.2 |
| ADR-5 | Default font tables (Trebuchet MS / Verdana / Arial) | **⚠ new** |
| ADR-6 | Plugin manifest, discovery paths and detector order | from D40, D41 |
| ADR-7 | Layered layout port from Pele; layout interface; measurement before layout | from D18 |
| ADR-8 | Parity oracle and divergence list | from D15, D16 |
| ADR-9 | Two-phase rendering: `prepare` / `renderSync` / `preload`, resource discovery | from D51 |
| ADR-10 | Extension plugins and hooks; interactions plugin | from D47, D52 |
| ADR-11 | Normative grammar files and generated dev-only tooling | from D54 |
| ADR-12 | AST ids and the `data-ast` source ↔ diagram mapping | from D53 |
| ADR-13 | Unit profile: layout depends on measurer + `UnitProfile`, every length constant in builder and engine comes from it | from D77 (M2) |
| ADR-14 | Text output: diagram `ascii` hooks over the shared layout, `core/ascii` kit, snapped stepped routes with a repair router | from D76, D78 (M2) |

## 17. Points for review

1. **§7.1 / ADR-3:** one typed writer, streaming by default, tree-backed only when a `postRender` hook is registered. It gives the same safety and keeps the fast path. Confirmed 2026-11-02.
2. **§8.2:** the new `output.cssVariables: false` option for SVG-to-PNG and other non-browser pipelines. Confirmed 2026-11-02.
3. **§5.2:** metric tables for Trebuchet MS, Verdana and Arial to keep v12's default font. `system-ui` is ruled out as the default: it maps to a different face per OS (and per Linux desktop), so no single metric table can match it and the table measurer would be wrong everywhere but one platform. Decided 2026-11-02: Trebuchet MS / Verdana / Arial tables for M1. The final default is settled before the 13.0 release, and changing it means regenerating metric tables and baselines, not changing code.
4. **§3 / §12.3:** `RenderResult.bindFunctions` is set only by the interactions plugin. The field is already optional in v12's RenderResult type, so v12 call sites written as bindFunctions?.(el) keep working either way: without the plugin the call is a no-op, and with it click callbacks work as before. Call sites that call it unguarded need the plugin installed. Confirmed 2026-11-02.
5. **§7.2:** keep v12 class names (`nodes`, `edgePaths`, `node`, …) rather than new ones. Confirmed 2026-11-02.
6. **§4.2:** AST ids are semantic (`n:A`, `e:A>B#2`, `s:id`, `st:3`), not offset-based, so they survive edits and editors keep UI state across re-parses. Decided 2026-11-02.
7. **§12.3:** the interactions plugin resolves callback names on `window`, as v12 did. Decided 2026-11-02: keep resolving callback names as v12 does, for compatibility. The safeguard stays as §12.3 describes it: the lookup only exists when the integrator installs the plugin.
8. **§6.1 / §12.1 / §12.2:** layout output is generic per plugin (`L`). `LayoutModel` is the contract for graph diagrams only. `postLayout` hooks get `{ kind, diagram, layout }`, and M1 item 23 keeps a non-graph stub in CI. Confirmed 2026-11-02.
