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
                                   LayoutModel ──► ascii backend (M2)
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

Later milestones add `packages/ascii` (M2), `packages/language-service` (M2.5), `packages/diagram-<type>` (M3+) and `packages/plugin-elk|math|icons|handdrawn`.

`core` exports these subpaths so diagram packages can import only what they need:
- `@mermaid-js/core/parser-kit`
- `/layout`
- `/svg`
- `/text`
- `/theme`
- `/config`

**Allowed dependency directions:**
- `diagram-*` → `core`.
- `mermaid` → `core` + `diagram-*`.
- `core` imports nothing.
- `diagram-*` never imports another `diagram-*`. This carries over the v12 isolation rule, and is now enforced with an eslint `no-restricted-imports` rule.

## 3. Public API and runtime flow (R-API-*, R-COMPAT-5)

```ts
// packages/mermaid
render(id: string, text: string, container?: Element): Promise<RenderResult>   // v12 signature kept; = prepare + renderSync
prepare(text: string, options?: RenderOptions): Promise<Prepared>              // new (R-API-2): detect, parse, load resources
renderSync(text: string, options?: RenderOptions): RenderResult                 // new (R-API-2): sync, pure, loaded resources only
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
```

**The `initialize()` paradox.** v12's `initialize` writes global state. In v13, `mermaid` keeps one `defaults` object, which is set by `initialize`, and every call reads it once into its `ResolvedConfig`. This is the only module-level state, and it lives in the public package, not in core. Core functions all take config as an argument (R-ARCH-4, -5).

**Two phases (R-API-2, D51).** Everything that can wait on the network happens in `prepare`; everything after it is synchronous and pure.

`prepare(text)` (async):
1. `limits.checkSource(text)` (R-SEC-5).
2. `preprocess(text)` returns `{ body, frontMatter, directives, sourceMap }` (§4.1).
3. `registry.detect(body)` returns the plugin manifest; its entry is imported if not loaded.
4. `resolveConfig(…)` and `plugin.parse(body, ctx)` run once to find the **resource set**: the diagram package, the layout engine named by config, icon packs referenced by the AST, and math if any label uses it. Each plugin reports its needs through an optional `resources(ast, ctx)` method.
5. Missing resources are loaded in parallel. The parse result is cached against the text, so `renderSync` right after `prepare` doesn't parse twice.

`renderSync(text)` (sync):
1. Steps 1–3 above, without loading. A missing resource throws `NotLoadedError { missing: Resource[] }`, unless `options.placeholders` is set, in which case a placeholder is drawn (e.g. an empty icon box) and a warning added.
2. `resolveConfig(defaults, initializeConfig, frontMatter.config, directives, pluginDefaults)` returns a frozen `ResolvedConfig` (§9).
3. `plugin.parse(body, ctx)` returns `ParseResult<Model>` (§4). If it has error diagnostics, throw `MermaidError`. Extension `postParse` hooks run on the AST (§12.2).
4. `plugin.layout?(model, ctx)` returns `LayoutModel`, or the plugin uses the shared engine through `ctx.layout(graph)` (§6). `postLayout` hooks run.
5. `plugin.render(layout, model, ctx, writer)` writes into an `SvgWriter` (§7). `postRender` hooks run on the node tree.
6. `writer.finish(root)` produces the string; `limits.checkOutput`.
7. The result is `{ svg, warnings: ctx.warnings, … }`.

`preload(…)` runs step 5 of `prepare` for an explicit list, for hosts such as markdown-it or SSR that can't await per diagram.

`ctx` is a `RenderContext`: `{ config, measurer, theme, limits, warn(), now }`. It's created per call, is frozen except for the warning sink, and is the only thing passed to plugins.

## 4. Parsing (R-PARSE-*, D14)

### 4.1 Preprocess (core)

Preprocessing reproduces the v12 text pipeline exactly (P1):
- CRLF normalisation
- front matter extraction using v12's fence regex
- `%%{init|initialize|wrap}%%` directives
- `%%` comment stripping
- entity encoding

It is done in **linear-time scans only** (R-PARSE-7). Front matter is parsed by a built-in YAML subset reader, ported from Pele's `util/yaml.ts` with attribution (R-REL-4). That reader has prototype-key protection and a depth cap of 64.

Every rewrite is recorded as an `Edit { at, removed, inserted }` in a `SourceMap`. Mapping back to original positions is lazy: it happens only when a diagnostic or a span is requested. Pele does the same (`errors.ts:27-48`).

### 4.2 Parser kit (`core/parser-kit`)

The kit has no grammar abstraction. It is a set of building blocks for hand-written lexers and recursive-descent parsers:

| Piece | Shape | Notes |
|---|---|---|
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

**AST and source ↔ diagram mapping (R-PARSE-8, D53).** `AstNode = { id: AstId, type, range, children? , … }`, with one exported type per node kind per diagram (`FlowNodeStmt`, `FlowEdge`, `FlowSubgraph`, …). `AstId` is a short string that is stable for the same source: the node kind plus the start offset of its range (`n:42`), so it survives re-parses of an unchanged document. The model keeps the `AstId` of every vertex, edge and subgraph, and the renderer writes it as `data-ast` on the element it draws (`data-ast` is in the attribute allow-list). An editor maps a cursor to elements with `querySelectorAll('[data-ast="…"]')` and an element back to source through `ast` lookup by id. `data-id` (R-SVG-2) stays the user's id, which edges and repeated node mentions don't have uniquely.

**jison compatibility shim (R-PARSE-6).** `MermaidError.hash = { loc: { first_line, last_line, first_column, last_column }, text, token, expected }`, generated from the first error diagnostic.

### 4.3 Flowchart parser (`diagram-flowchart/src/parser/`)

- `lexer.ts`: a state machine that mirrors `flow.jison`'s start conditions, the way Pele's flowchart lexer does. The Chevrotain branch's `flow.tokens.ts` / lexer specs serve as the token-level reference.
- `parser.ts`: recursive descent producing a `FlowModel`. It is not a v12 `FlowDB`, but there is a 1:1 normaliser to the `flow.db-parity.spec.ts` snapshot shape (§13.1).
- `FlowModel` = `{ direction, vertices: Map<id, Vertex>, edges: Edge[], classes, subgraphs, tooltips, links, accTitle, accDescr, warnings }`. It keeps insertion order (R-ARCH-7).
- Shape data `@{ … }` is parsed with the core YAML reader. Shape names are validated against v12's list, with v12's error messages.
- `click … callback|call` is parsed into the model (`FlowModel.callbacks`). The renderer ignores it. If no extension plugin claims callbacks (§12.3), a warning diagnostic `CALLBACK_IGNORED` is added (R-SVG-5).

### 4.4 Grammar files (R-PARSE-9, D54)

Each diagram package has `grammar/<type>.ebnf`: a concise EBNF with lexer modes (the equivalent of jison start conditions). It is the normative definition of the syntax; the hand-written parser is the fast implementation of it. `tools/gen-grammar` turns it into:

| Output | Used for | Ships? |
|---|---|---|
| A generated reference parser (table-driven, slow is fine) | Differential test against the hand-written parser in CI: same accept/reject and same AST shape on the corpus and on generated sentences | No (dev/CI only) |
| A sentence generator (bounded depth, weighted by corpus frequency) | Fuzz input for R-SEC-7 and the differential test | No |
| TextMate, Monarch and Lezer grammars | Syntax highlighting in VS Code, Monaco, CodeMirror (R-LANG-2) | As separate artefacts, not in core |
| Syntax reference page | Docs | Docs only |

Conflicts between the three sources of truth are resolved in this order: the oracle (`mermaid@12`) decides what is valid syntax (R-COMPAT-2); the grammar file is fixed to match; the hand-written parser must match the grammar. A divergence from the oracle is listed in `divergences.json` as usual.

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
- **`tableMeasurer`** is the Node default and the `deterministic: true` default. It sums packed advance widths and applies the wide, zero-width and default-width rules. It is used in all tests.
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

## 6. Layout (R-LAYOUT-*, D18)

### 6.1 Interface

```ts
interface LayoutGraph {
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  nodes: { id: string; width: number; height: number; parent?: string; shape?: string }[];
  edges: { id: string; source: string; target: string; minLen: number; label?: { width: number; height: number } }[];
  groups: { id: string; parent?: string; direction?: Dir; padding: Box; title?: { width: number; height: number } }[];
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
type LayoutEngine = (g: LayoutGraph, ctx: LayoutContext) => LayoutModel;
```

The rules:
- The graph and the result are plain data, so the ASCII backend (M2) and DDLT-style fixtures can use them directly (R-ARCH-3).
- Measurement happens **before** layout: diagram code fills in `width` and `height` using the injected measurer, and the engine never measures. Layout depends on the measurer only, never on a backend (R-ARCH-3, D57). For ASCII the same code runs with a character-grid measurer (widths in cells, heights in lines), so the ASCII backend receives a normal `LayoutModel` and never measures itself.
- The engine is selected by the `layout` config key. `layered` is the default. Other engines are registered via `registerLayoutLoaders` (R-LAYOUT-2).

### 6.2 `layered` engine (`core/layout/layered`) ⚠ pending O-7

O-7 asks whether to port Pele's layout or depend on Pele's package. This design assumes a **port**, because R-PERF-2 forbids runtime dependencies and the changes listed below (v12 config values, `minLen`, routes as data, determinism) need control over the code. If O-7 goes the other way, the interface in §6.1 stays and only this engine changes.

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

### 7.1 SvgWriter ⚠ review — reading of D35 and D52

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

- Group class names follow v12 (`nodes`, `edgePaths`, `edgeLabels`, `clusters`, `node`, `edge`, `cluster`, plus user `classDef` classes) where possible. This reduces breakage for integrators who style or query the SVG (P1).
- `useMaxWidth` keeps its v12 meaning (R-SVG-7).

## 8. Theming (R-THEME-*, D20, D39)

### 8.1 Model

```
themeVariables (config)  ──►  ThemeSpec  ──►  root style aliases  ──►  elements reference aliases
  base vars (≤ 8)             { base: {…},       --_pf: var(--mermaid-primaryColor, #ECECFF);
  + any explicit override       derived: {…} }    --_pb: var(--mermaid-primaryBorderColor,
                                                    color-mix(in srgb, var(--_pf) 85%, black));
```

1. **Built-in themes** (`redux`, `default`, `dark`, `forest`, `neutral`, `base`) are `ThemeSpec` data files. Each is a table of base values plus a derivation table, not a class with khroma code. **`redux` is the default** when no theme is set (R-THEME-6, D55).
   - A `ThemeSpec` also carries **shape tokens**, not only colours: stroke widths, corner radii, font weights and sizes, and spacing steps. Diagram renderers read sizes from these tokens instead of hard-coding them, so every diagram type rendered in redux looks like one family (R-THEME-11). Tokens are exposed as CSS variables like the colours (`--mermaid-strokeWidth`, `--mermaid-radius`, …).
   - The redux palette and tokens are taken from the v12 redux themes (`redux`, `redux-dark`, and their colour variants), so P1 applies to them like the others.
2. **Derivation rules** are expressions in a tiny DSL: `mix(primaryColor, black, 15%)`, `contrast(primaryColor)`, `invert(…)`. Each rule compiles to two things:
   - a CSS expression: `color-mix(in srgb, …)` or a `light/dark` ink pair;
   - a JS-computed fallback value, from the same formula in `core/theme/color.ts` (sRGB mixing, WCAG luminance; about 1 KB).

   Using `in srgb` means the JS fallback and the browser result are **numerically identical**, so `deterministic` output stays exact.
3. **Matching v12's colours.** v12 derives with khroma's `darken`/`lighten`/`adjust` in HSL. A `color-mix` in sRGB doesn't reproduce those exactly. Rules are chosen to stay within ΔE < 5 of v12's derived colours for the five built-in themes, checked by a test that compares against values extracted from `mermaid@12`. Exact equality isn't required (P2), but resemblance is (R-THEME-6). **[ADR-4]**
4. **Precedence when resolving:**
   - a `themeVariables` key set explicitly by the author is used as a literal fallback, and the CSS var still wins;
   - otherwise the derived rule is used.
   - The CSS variable name is always `--mermaid-<v12 name>` (R-THEME-2).
5. **Alias layer:** short private aliases (`--_pf`) keep output small, and only the aliases actually used are written to the root (from Pele).
6. **`theme: 'auto'`** (Could): emits a `<style>` containing only `@media (prefers-color-scheme: dark){ svg[data-p="{p}"]{ --mermaid-…: … } }` from the dark spec. The allow-list test permits `<style>` only in this mode, and only with variable declarations.

### 8.2 Non-browser consumers ⚠ review

`fill="var(--_pf)"` works in browsers. resvg, librsvg, Inkscape and some image proxies don't resolve CSS variables. This design adds `output.cssVariables: false` (integrator option), which emits the computed literal colours instead. The output is then still themed, but can't be re-themed by host CSS. The default is `true`. **[ADR-4]**

### 8.3 Inventory (O-1)

`tools/gen-config` extracts every theme variable read by the ported diagrams and builds a table: name, base/derived, rule, used-by. Until a diagram is ported, its variables are accepted but unused (R-CONF-5). Numbered palettes (`pie1…12`, `git0…7`, `cScale0…11`) become `--mermaid-pie1` and so on, each derived from base variables in the same way.

## 9. Configuration (R-CONF-*, D22, D42)

- **Schema stays the source of truth:** `config.schema.yaml` is moved to `packages/core/schema/` and keeps every v12 key except the removed ones (R-CONF-1). `config.type.ts` is still generated from it.
- **Defaults are split by owner:** `tools/gen-config` writes the top-level defaults into core and each diagram section's defaults into its package. A flowchart bundle doesn't carry the defaults of 30 other diagrams.
- **Resolution:** `resolveConfig()` deep-merges in v12's order: defaults → initialize → front matter → directives (R-CONF-3).
  - The secure-key filter is applied to front matter and directives.
  - Unknown and removed keys go to `ctx.warn` (R-CONF-2).
  - The result is deep-frozen once.
  - This replaces v12's per-call deep cloning, the cost #8635 measured.
- **Integrator-only options** never come from diagram text: limits, measurer, `deterministic`, `output.cssVariables`, `idPrefix`, `securityLevel`, link schemes (R-SEC-5, R-SEC-6).
- **Config reference doc (R-CONF-4, D60):** generated from the JSON schema alone. Each key in `config.schema.yaml` carries an `x-mermaid` annotation: `{ status: honoured | ignored | pending | removed | moved, since?: '13.0.0', movedTo?: '@mermaid-js/plugin-interactions', replacement?: string, reason?: string }`. CI fails if the generated doc is stale or a key has no annotation. MIGRATION.md's config section is generated from the same data. Click-callback keys are `moved` to the interactions plugin (R-CONF-1).

## 10. Security (R-SEC-*)

| Threat | Control | Where |
|---|---|---|
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
  hash: JisonHash;                                                  // compat shim (R-PARSE-6)
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
interface DiagramPlugin<M = unknown> {
  id: string;                                   // 'flowchart'
  aliases?: string[];                           // 'graph', 'flowchart-v2', 'flowchart-elk'
  detector: (text: string, config: ResolvedConfig) => boolean;
  formats: ('svg' | 'ascii')[];                 // R-ASCII-5; also in the manifest
  parse(text: string, ctx: RenderContext): ParseResult<M>;
  resources?(ast: AstNode, ctx: RenderContext): Resource[];   // icon packs, math, layout engine (R-API-2)
  layout?(model: M, ctx: RenderContext): LayoutModel;          // or use ctx.layout(graph)
  render(model: M, layout: LayoutModel, ctx: RenderContext, w: SvgWriter): void;
  ascii?(model: M, layout: LayoutModel, ctx: RenderContext): string;   // M2
  configDefaults?: object;                      // its schema section defaults
  themeVariables?: ThemeRuleTable;              // its derived vars
}
```

**Manifest** in the plugin's `package.json`:

```json
"mermaid": { "plugin": "diagram", "id": "gantt", "formats": ["svg"], "detector": "./dist/detector.js", "entry": "./dist/index.js" }
"mermaid": { "plugin": "extension", "id": "interactions", "entry": "./dist/index.js" }
```

`plugin` is the kind. Extension manifests have no detector; the entry is loaded when the plugin is activated (on discovery, or through `registerExternalDiagrams`).

**Formats (R-ASCII-5, D58).** `supportsFormat(type, format)` reads `formats` from the manifest, so hosts can check without loading the package. A type supports ASCII through an `ascii` hook, or by being graph-based on the shared layout. Asking for an unsupported format throws `UnsupportedFormatError`, never an approximation. The docs' type × format matrix is generated from the manifests.

### 12.2 Extension plugins and hooks

```ts
interface ExtensionPlugin {
  id: string;
  postParse?(ast: AstNode, ctx: RenderContext): AstNode;
  postLayout?(layout: LayoutModel, ctx: RenderContext): LayoutModel;
  postRender?(tree: SvgTree, ctx: RenderContext): void;        // edits in place, before serialisation (§7.1)
  afterMount?(el: Element, result: RenderResult): void;         // DOM adapter only
  claims?: ('callbacks')[];                                    // features it handles, to silence core's warning
}
```

- Hooks run in registration order. Each gets the frozen context, so they can't change config.
- `postRender` runs on the compact tree; core then re-checks the allow-list, so a hook can't introduce `<script>`, `on*` or unsafe URLs (R-SEC-2).
- `afterMount` exists only in `mermaid`'s DOM adapter (`run`, `mount`, `bindFunctions`). Core never calls DOM code.

### 12.3 Interactions plugin (R-PLUG-9, D47)

`@mermaid-js/plugin-interactions` restores v12 `click X callback` / `call` from M1. Core keeps callbacks in the model and emits `data-id`/`data-ast` on every node. The plugin:
- reads the callbacks from the parse result through `postParse` (and claims `callbacks`, so core doesn't warn);
- binds click handlers in `afterMount`, resolving function names the way v12 did. This includes looking names up on `window`, which is why it is opt-in by installation only and diagram text can't enable it;
- provides `RenderResult.bindFunctions`, so v12 call sites that call `bindFunctions(el)` after `render()` keep working.

Its config keys (moved from the core schema) live in its own schema section.

### 12.4 Discovery

**Discovery paths:**

| Environment | Mechanism |
|---|---|
| First-party, any env | `mermaid` depends on all `@mermaid-js/diagram-*`. A generated `registry.gen.ts` holds `{ id, detector (static import, tiny), load: () => import('@mermaid-js/diagram-x') }`. Bundlers code-split per type (R-PLUG-4). |
| Node / SSR, third-party | On first `render`, `mermaid/node` scans `node_modules` (`require.resolve` paths) for packages with a `mermaid.plugin` manifest, then caches the result. |
| Bundlers, third-party | `mermaid/plugin` (unplugin) does the same scan at build time and provides `virtual:mermaid-plugins`, which `mermaid` imports if present. |
| CDN | First-party diagrams lazy-load from `cdnBase` (default: the URL `mermaid` itself was loaded from). Third-party scripts self-register by calling `globalThis.mermaid.registerExternalDiagrams`. Never loaded from diagram text (R-PLUG-7). |
| Explicit | `registerExternalDiagrams()` (R-PLUG-6). |

**Detector order:** first-party detectors run first, in v12's registration order (detection order is part of "syntax is sacred"), then third-party detectors in discovery order. **[ADR-6]**

## 13. Testing architecture (R-TEST-*)

### 13.1 Parity oracle (`packages/conformance`)

```
corpus source ──► mermaid@12 (jsdom-free: parser + db only, via its diagram API) ──► normalise ──┐
            └───► v13 plugin.parse ──────────────────────────────────────────────► normalise ──┴─► deep-equal | divergences.json
```

- **Reference pattern:** the Chevrotain branch (`flow.parse-corpus.spec.ts` with `PARSE_FIXTURE_PATH`, `flow.db-parity.spec.ts` snapshot functions). The normaliser for flowchart is literally its `snapshotVertex` / `snapshotEdge` shape.
- **Tiers:**
  - PR CI: in-repo corpus (e2e `.mmd`, docs examples, ported spec strings, the 158-diagram bench corpus).
  - Nightly: the external 10k+ set via `PARSE_FIXTURE_PATH` (O-3) plus fuzzing with a seeded mutator (from Pele's `tests/support/corpus.ts` approach).
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
|---|---|
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
|---|---|---|---|
| 1 | Branch scaffolding: delete v12 sources, create packages, lint rules (DOM ban, import boundaries, console ban, regex lint), CI skeleton | R-ARCH-9, R-PLUG-1 | – |
| 2 | `bench` package from approaches harness + size/stage gates | R-PERF-1…7, R-TEST-7 | 1 |
| 3 | `conformance` package: oracle runner, normaliser API, divergences, nightly external corpus | R-COMPAT-2…4, R-TEST-1…3 | 1 |
| 4 | Preprocess + YAML + SourceMap | R-COMPAT-6, R-PARSE-7 | 1 |
| 5 | Parser kit, AST types and ids | R-PARSE-2…6, -8 | 1 |
| 6 | Config: schema move, `x-mermaid` annotations, gen-config, resolveConfig, generated config reference | R-CONF-* | 1 |
| 7 | Flowchart lexer + parser + FlowModel + AST, oracle-green | R-COMPAT-2/3, R-PARSE-3/4/8 | 3,4,5 |
| 8 | Measurer interface + table measurer + gen-metrics + canvas measurer | R-TEXT-4…7, -9 | 1 |
| 9 | Label layout (markdown incl. bullets, HTML subset, wrapping) | R-TEXT-1…3, -8, -11 | 8 |
| 10 | Layered + compound layout port, DDLT-style tests (after O-7) | R-LAYOUT-1…6 | 1 |
| 11 | SvgWriter (streaming + tree backing, `SvgTree` view), url/style/colour safety, `securityLevel`, allow-list test | R-SVG-1, R-SEC-1…4, -6 | 1 |
| 12 | Theme specs incl. redux and shape tokens, derivation DSL, CSS vars, ΔE test vs v12 | R-THEME-* | 11 |
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

R-COMPAT-10 (drop-in upgrade) and R-ASCII-5 are not M1 work: the first is release step two, the second lands with M2.

The parallel tracks after item 1:
- (2, 3), (4, 5, 6), 8→9, 10, 11→12 can all run side by side.
- Item 13 is the join point. 20 runs alongside 7; 21→22 follow 14/15.

## 16. ADRs to write

| ADR | Title | Status |
|---|---|---|
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

## 17. Points for review

1. **§7.1 / ADR-3:** one typed writer, streaming by default, tree-backed only when a `postRender` hook is registered. It gives the same safety and keeps the fast path. OK?
2. **§8.2:** the new `output.cssVariables: false` option for SVG-to-PNG and other non-browser pipelines. OK?
3. **§8.1(3):** v12 derived colours reproduced to within ΔE < 5, not exactly. OK?
4. **§5.2:** metric tables for Trebuchet MS, Verdana and Arial to keep v12's default font. Alternatively, switch the v13 default to `system-ui`, which goes against P1 but looks more modern.
5. **§3 / §12.3:** `RenderResult.bindFunctions` is set by the interactions plugin and undefined without it, so v12 call sites keep working when the plugin is installed.
6. **§7.2:** keep v12 class names (`nodes`, `edgePaths`, `node`, …) rather than new ones.
7. **§4.2:** AST ids as kind + start offset (`n:42`), written to `data-ast`. Stable for unchanged text, but ids after an edit point shift. Good enough for editors, or do we need ids that survive edits?
8. **§12.3:** the interactions plugin resolves callback names on `window`, as v12 did. Keep that for compatibility, or require integrators to register the functions explicitly?
9. **§6.2:** the design assumes O-7 is answered with "port".
