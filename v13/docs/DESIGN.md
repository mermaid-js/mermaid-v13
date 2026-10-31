# Mermaid v13 — Design

Status: **Draft for review** · 2026-10-31
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
tools/
  gen-metrics/          font metric table generator (§5.3)
  gen-config/           schema → per-package defaults + honoured-keys table (§9)
```

Later milestones add `packages/ascii` (M2), `packages/language-service` (M2.5), `packages/diagram-<type>` (M3+) and `packages/plugin-elk|katex|icons|handdrawn`.

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
render(id: string, text: string, container?: Element): Promise<RenderResult>   // v12 signature kept
renderSync(text: string, options?: RenderOptions): RenderResult                 // new (R-API-2)
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
  bindFunctions?: undefined;                   // kept as a property for type compat, always undefined
}
```

**The `initialize()` paradox.** v12's `initialize` writes global state. In v13, `mermaid` keeps one `defaults` object, which is set by `initialize`, and every call reads it once into its `ResolvedConfig`. This is the only module-level state, and it lives in the public package, not in core. Core functions all take config as an argument (R-ARCH-4, -5).

**Steps of `render` / `renderSync`:**
1. `limits.checkSource(text)` (R-SEC-5).
2. `preprocess(text)` returns `{ body, frontMatter, directives, sourceMap }` (§4.1).
3. `registry.detect(body)` returns the plugin manifest. If it isn't loaded, `render` awaits the lazy entry, and `renderSync` throws `PLUGIN_NOT_LOADED`.
4. `resolveConfig(defaults, initializeConfig, frontMatter.config, directives, pluginDefaults)` returns a frozen `ResolvedConfig` (§9).
5. `plugin.parse(body, ctx)` returns `ParseResult<Model>` (§4). If it has error diagnostics, throw `MermaidError`.
6. `plugin.layout?(model, ctx)` returns `LayoutModel`, or the plugin uses the shared engine through `ctx.layout(graph)` (§6).
7. `plugin.render(layout, model, ctx, writer)` writes into an `SvgWriter` (§7).
8. `writer.finish(root)` produces the string; `limits.checkOutput`.
9. The result is `{ svg, warnings: ctx.warnings, … }`.

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
  diagnostics: Diagnostic[];      // errors + warnings, ranges in ORIGINAL source
  symbols: SymbolOccurrence[];
  statements: StatementSpan[];
  tokens?: TokenStream;           // only when ctx.config.internal.keepTokens (editors)
}
```

Spans cost almost nothing (the research measured 2 bytes gzipped for identifier spans), so they are always produced. Only the token stream, which can be large, is opt-in.

**jison compatibility shim (R-PARSE-6).** `MermaidError.hash = { loc: { first_line, last_line, first_column, last_column }, text, token, expected }`, generated from the first error diagnostic.

### 4.3 Flowchart parser (`diagram-flowchart/src/parser/`)

- `lexer.ts`: a state machine that mirrors `flow.jison`'s start conditions, the way Pele's flowchart lexer does. The Chevrotain branch's `flow.tokens.ts` / lexer specs serve as the token-level reference.
- `parser.ts`: recursive descent producing a `FlowModel`. It is not a v12 `FlowDB`, but there is a 1:1 normaliser to the `flow.db-parity.spec.ts` snapshot shape (§13.1).
- `FlowModel` = `{ direction, vertices: Map<id, Vertex>, edges: Edge[], classes, subgraphs, tooltips, links, accTitle, accDescr, warnings }`. It keeps insertion order (R-ARCH-7).
- Shape data `@{ … }` is parsed with the core YAML reader. Shape names are validated against v12's list, with v12's error messages.
- `click … callback|call` produces a warning diagnostic `CALLBACK_IGNORED` (R-SVG-5).

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
- **Markdown strings:** bold, italic, inline code and line breaks (R-TEXT-2).
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
- Measurement happens **before** layout: diagram code fills in `width` and `height`, and the engine never measures.
- The engine is selected by the `layout` config key. `layered` is the default. Other engines are registered via `registerLayoutLoaders` (R-LAYOUT-2).

### 6.2 `layered` engine (`core/layout/layered`)

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

### 7.1 SvgWriter ⚠ review — reading of D35

D35 says plugins return an "SvgNode tree" so escaping is guaranteed. A real object tree costs allocations on large diagrams, while Pele's string building is a large part of its speed. This design keeps the guarantee and avoids the tree: plugins write through a **typed streaming writer** that is the *only* way to produce markup. **[ADR-3]**

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
- Element ids: only `${idPrefix}-title` / `-desc` (R-A11Y-1). Everything else uses `data-id` and classes (R-SVG-2, -3).

If review prefers a real tree, `SvgWriter` can be backed by a tree builder without changing the plugin API.

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

1. **Built-in themes** (`default`, `dark`, `forest`, `neutral`, `base`) are `ThemeSpec` data files. Each is a table of base values plus a derivation table, not a class with khroma code.
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
- **Integrator-only options** never come from diagram text: limits, measurer, `deterministic`, `output.cssVariables`, `idPrefix`, link schemes (R-SEC-5).
- **Honoured-keys table:** generated into docs and checked in CI (R-CONF-4). Each key's status is `honoured | ignored (reason) | pending (diagram not ported)`.

## 10. Security (R-SEC-*)

| Threat | Control | Where |
|---|---|---|
| Markup injection via labels | Labels are text runs and every value is escaped by the writer. No HTML mode exists. | §5.3, §7.1 |
| Script / event handlers | Tag and attr unions exclude them; property test over corpus + ported v12 XSS pages | §7.1, R-SEC-2 |
| CSS injection via `style`/`classDef`/`linkStyle` | Property allow-list; values matching `url( expression( javascript: @import image-set /* [<>{};\\]` are dropped; output as presentation attrs (`SafeColor`, `SafeLength`) | `core/svg/style.ts` |
| Malicious links | `checkUrl`: control-char/entity stripping (port of the `sanitize-url` logic), scheme allow-list on raw + decoded form, `//host` blocked, `rel="noopener"` | `core/svg/url.ts` |
| Theme-variable injection | `safeColor`: charset + function allow-list (`rgb hsl lab oklch color-mix light-dark var(--mermaid-*)`) | `core/theme` |
| DoS: input size, edges, nesting, output size | Limits in `RenderContext`, integrator-only; `RangeError` → `LIMIT` error | `core/limits.ts` |
| DoS: ReDoS | Linear scanners; regex lint; stress suite (50k runs, 1000-deep nesting, unclosed constructs) | parser kit |
| Prototype pollution | YAML/JSON merge skips `__proto__`, `constructor`, `prototype` | `core/config` |

## 11. Errors (R-ERR-*)

```ts
class MermaidError extends Error {
  code: 'SYNTAX' | 'SEMANTIC' | 'UNSUPPORTED_DIAGRAM' | 'PLUGIN_NOT_LOADED' | 'LIMIT' | 'INTERNAL';
  line: number; column: number; offset: number; length: number;   // original source, 1-based line/col
  expected?: string[]; diagnostics: Diagnostic[];                   // all diagnostics, first is primary
  hash: JisonHash;                                                  // compat shim (R-PARSE-6)
}
```

- The message format is v12/jison-like (P1), improved by the expected list of at most 5 groups and the opener reference (R-ERR-2). Snapshot tests over an error corpus in `diagram-flowchart/test/errors/`.
- The DOM adapter's error box is built with `textContent` only (R-ERR-3).

## 12. Plugins and discovery (R-PLUG-*, D35, D40, D41)

```ts
interface DiagramPlugin<M = unknown> {
  id: string;                                   // 'flowchart'
  aliases?: string[];                           // 'graph', 'flowchart-v2', 'flowchart-elk'
  detector: (text: string, config: ResolvedConfig) => boolean;
  parse(text: string, ctx: RenderContext): ParseResult<M>;
  layout?(model: M, ctx: RenderContext): LayoutModel;          // or use ctx.layout(graph)
  render(model: M, layout: LayoutModel, ctx: RenderContext, w: SvgWriter): void;
  ascii?(model: M, layout: LayoutModel, ctx: RenderContext): string;   // M2
  configDefaults?: object;                      // its schema section defaults
  themeVariables?: ThemeRuleTable;              // its derived vars
}
```

**Manifest** in the plugin's `package.json`:

```json
"mermaid": { "plugin": "diagram", "id": "gantt", "detector": "./dist/detector.js", "entry": "./dist/index.js" }
```

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

Shapes are the biggest risk, because v12 has 113 of them. If they go over budget, split rare shapes into a lazily loaded chunk.

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
| 5 | Parser kit | R-PARSE-2…6 | 1 |
| 6 | Config: schema move, gen-config, resolveConfig, honoured-keys table | R-CONF-* | 1 |
| 7 | Flowchart lexer + parser + FlowModel, oracle-green | R-COMPAT-2/3, R-PARSE-3/4 | 3,4,5 |
| 8 | Measurer interface + table measurer + gen-metrics + canvas measurer | R-TEXT-4…7, -9 | 1 |
| 9 | Label layout (markdown, HTML subset, wrapping) | R-TEXT-1…3, -8 | 8 |
| 10 | Layered + compound layout port, DDLT-style tests | R-LAYOUT-1…6 | 1 |
| 11 | SvgWriter, url/style/colour safety, allow-list test | R-SVG-1, R-SEC-1…4 | 1 |
| 12 | Theme specs, derivation DSL, CSS vars, ΔE test vs v12 | R-THEME-* | 11 |
| 13 | Flowchart renderer: shapes, edges, clusters, labels, a11y | R-LAYOUT-4, R-SVG-*, R-A11Y-* | 7,9,10,11,12 |
| 14 | `mermaid` API: render/renderSync/parse/initialize, Registry, errors | R-API-1…5, R-ERR-* | 6,13 |
| 15 | DOM adapter: run, mount | R-API-6/7 | 14 |
| 16 | Limits + fuzz + stress suites | R-SEC-5, -7 | 7,13 |
| 17 | Visual baseline + gallery | R-TEST-5/6 | 13 |
| 18 | MIGRATION.md + honoured-keys docs | R-COMPAT-9 | 6,14 |
| 19 | Release pipeline: changesets pre mode, private publish, public gate | R-REL-* | 2,14 |

The parallel tracks after item 1:
- (2, 3), (4, 5, 6), 8→9, 10, 11→12 can all run side by side.
- Item 13 is the join point.

## 16. ADRs to write

| ADR | Title | Status |
|---|---|---|
| ADR-1 | Hand-written parsers with a parser kit; Chevrotain/jison as test oracles only | from D14 |
| ADR-2 | DOM-free core; measurement via injected `Measurer` | from D4, D17 |
| ADR-3 | Typed streaming `SvgWriter` instead of a materialised node tree | **⚠ new reading of D35** |
| ADR-4 | Theme = v12 vocabulary as CSS vars; derivation DSL compiled to `color-mix(in srgb)` + identical JS fallback; `cssVariables:false` for non-browser consumers | from D20, D39, ⚠ §8.2 |
| ADR-5 | Default font tables (Trebuchet MS / Verdana / Arial) | **⚠ new** |
| ADR-6 | Plugin manifest, discovery paths and detector order | from D40, D41 |
| ADR-7 | Layered layout port from Pele; layout interface; measurement before layout | from D18 |
| ADR-8 | Parity oracle and divergence list | from D15, D16 |

## 17. Points for review

1. **§7.1 / ADR-3:** a typed writer instead of a node tree. It gives the same safety and is faster. OK?
2. **§8.2:** the new `output.cssVariables: false` option for SVG-to-PNG and other non-browser pipelines. OK?
3. **§8.1(3):** v12 derived colours reproduced to within ΔE < 5, not exactly. OK?
4. **§5.2:** metric tables for Trebuchet MS, Verdana and Arial to keep v12's default font. Alternatively, switch the v13 default to `system-ui`, which goes against P1 but looks more modern.
5. **§3:** `RenderResult.bindFunctions` is kept as an always-undefined property, so v12 call sites that do `bindFunctions?.(el)` keep compiling.
6. **§7.2:** keep v12 class names (`nodes`, `edgePaths`, `node`, …) rather than new ones.
