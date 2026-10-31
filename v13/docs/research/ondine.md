# Ondine — research notes for Mermaid v13

Source: `https://github.com/wevm/ondine`, shallow clone at `/Users/knsv/repos/mermaid-v13/.tmp/ondine`
(npm `ondine@0.0.3`, MIT, © weth LLC + Pele notice © kepano). Paths below are relative to that clone.
Nothing was built or installed; this is a read of the source, docs, and checked-in bench notes.

## TL;DR

- Ondine is a **file-by-file, behavior-preserving port of Pele** (Obsidian's zero-dependency TS
  Mermaid renderer) to Rust. It is not a redesign. Every Rust module header says "Port of Pele's
  `src/<path>.ts`", and the rule is written down in `AGENTS.md` ("Porting from Pele").
- About 125k lines of Rust: `crates/compiler/src/diagrams` 91k, `svg` 10k, `layout` 9k, `text` 7k,
  `util` 2k. 33 diagram types. Two crates: a pure `compiler` and a thin `wasm` adapter.
- Correctness is defined **relative to two oracles**. (1) **Mermaid 12.1.0** decides syntax and
  models: same accept/reject, same detected type, same DB model, checked with fuzzing. (2) **Pele**
  decides output: byte-for-byte SVG parity after a normalization pass. Layout and look deliberately
  differ from Mermaid.
- Text measurement is a **monospace advance with no font data** (0.6 em, 1.2 em for wide characters,
  0 for zero-width). That is the key decision that keeps the compiler pure and deterministic across
  hosts.
- WASM boundary: a **hand-written C ABI, no wasm-bindgen**. A bump arena is reset per render, and
  results come back in one length-prefixed buffer. The JS glue is about 1 KB gzip.
- Size: flowchart-only module is **~137 KB gzip** (nightly `build-std` + `immediate-abort` +
  `wasm-opt -Oz`). The all-types module is ~637 KB gzip. A Node "fast" build is about 1.8x faster
  than Pele.
- Product framing: **compile ahead of time**. Vite plugin, CLI, remark plugin, and a Cloudflare
  image Worker produce SVG. The browser runtime is only `mount()` (~210 B), and in-browser
  compilation is opt-in.

## 1. Crate / module layout

```
Cargo.toml                 workspace; lints (clippy pedantic, deny unsafe), profiles release + wasm(opt z, panic abort)
rust-toolchain.toml        pinned 1.97.0 + wasm32-unknown-unknown
clippy.toml                bans std::fs/env/time, HashMap/HashSet, str::replace, str::to_lowercase
crates/compiler/           "Pure Mermaid-to-SVG compiler" — no I/O, clock, env, threads
  src/lib.rs               pub fn render(source, options_json, now) -> Result<Rendered, Error>
  src/preprocess.rs        line endings, front matter, directives, comments (port of Pele preprocess.ts)
  src/detect.rs            Mermaid's detectors (port of detect.ts)
  src/yaml.rs              small YAML/JSON reader (js-yaml JSON-schema subset); also parses options JSON
  src/error.rs             Code = limit | semantic | syntax | unsupported-diagram, with line/col/snippet
  src/model.rs             feature "model": parsed model as JSON, for parity tests only
  src/diagrams.rs          per-diagram contract + Cargo feature gate per type
  src/diagrams/<type>.rs + <type>/{lexer,tokens,parser,db,graph,render,types,shapes}.rs
  src/diagrams/common/     shared Langium-style tokenizer (tokens.rs), fit/fit_text/fit_width, outline, icons, acc_descr
  src/layout/layered.rs    Sugiyama layered layout (5.5k lines)
  src/layout/compound.rs   nested groups/subgraphs on top of layered
  src/layout/lanes.rs      swimlanes
  src/svg/{root,builder,shapes,edges,cluster,theme,title}.rs   SVG emission
  src/text/{label,measure,entities,icons}.rs                   label layout (6.5k lines), monospace widths
  src/util/{url,float,unicode,chars}.rs                        URL sanitizing, float formatting/parsing
  tests/fixtures/<type>-parse.json                             literals ported from Mermaid's specs (via Pele)
crates/wasm/src/lib.rs     bump-arena allocator + exports: reset, alloc, render, (model)
src/                       TypeScript package: Render.ts, internal/Wasm.ts, compiler/, cli/, remark/, vite/, Mount.ts
scripts/build-wasm.ts      builds one module per type + all + all.fast + test model module
scripts/size.ts            gzip budgets
test/oracles/              Mermaid-as-oracle parity suite (vendored jison grammars)
test/vectors/              Pele corpus (503 doc examples, 167 samples, 81 layout cases)
bench/                     size.md, speed.md, comparison.md, Chrome/Node harnesses
.agents/{plan,design}.md   implementation plan and design proposals
```

Per-diagram structure (`crates/compiler/src/diagrams.rs`): each type receives an `Input`
(`config: &yaml::Value`, `source`, `title`, `line_offset`, `max_edges`) and returns
`Rendered { svg, width, height, links }`. Each type is a Cargo feature (`crates/compiler/Cargo.toml`),
so `--features flowchart` compiles only flowchart, plus shared code and anything it depends on.
(`agentflow`/`swimlane` pull in `flowchart`, see the comment in `diagrams.rs`.)

## 2. How closely it mirrors Pele: port, not redesign

- `AGENTS.md` § "Porting from Pele" says to **mirror modules**: `src/<path>.ts` becomes
  `crates/compiler/src/<path>.rs`, and functions, constants, algorithms, iteration orders, and
  tie-breaks stay the same. A deliberate difference must be named in a comment.
- Every module's `//!` header cites the Pele file it ports, for example `layout/layered.rs` ("Port
  of Pele's `src/layout/layered.ts`") and `flowchart/lexer.rs`. The same holds for `svg/*` and
  `text/label.rs`.
- **JS semantics are reproduced by hand:** UTF-16 positions for anything that reaches output or
  diagnostics, `Math.round` half-up, stable sort, and insertion-ordered maps (BTreeMap index + Vec).
  See the header of `flowchart/db.rs`.
- **No regex.** Every Pele RegExp becomes a hand-written matcher with the same semantics. The `regex`
  crate is banned for size reasons.
- The documented deliberate differences are small. Theme variables are `--ondine-*` instead of
  `--pele-*` (`svg/theme.rs`), the default look is monochrome monospace, and the `info` diagram
  draws Ondine's own name (`src/Parity.test.ts`).
- `.agents/plan.md` gives the history. A PoC wrapped **Merman** and produced a 20 MB playground
  compiler. The rewrite dropped it for a straight Pele port: "Pele already matches Mermaid's parsers
  and draws good layouts, so behavior is ported first and improved later with evidence."
- `.agents/design.md` lists look changes (orthogonal edges, square label patches, fixed radii) as
  *proposals* gated on breaking Pele byte-parity. Parity comes first and divergence second.

## 3. Parsing

- Every parser is a **hand-written lexer and recursive-descent parser**. There are no parser
  generators and no runtime deps.
  - JISON-derived types use a per-type lexer state machine "equivalent to Mermaid's Jison lexer"
    and a parser that "reports the same errors at the same tokens"
    (`diagrams/flowchart/lexer.rs`, `parser.rs`).
  - Langium-derived types (architecture, git, info, packet, pie, radar, treemap, ...) share
    `diagrams/common/tokens.rs`, a first-match tokenizer "as in Chevrotain" with per-diagram
    matchers.
- Lexers work over UTF-8 bytes with ASCII fast paths. Columns are converted to UTF-16 only for
  diagnostics.
- A `db.rs` per type mirrors Mermaid's DB classes (`FlowDB`, etc.), and `graph.rs` resolves the
  drawn graph (subgraph membership, classDefs).
- Limits are built in. Source is capped at 50k chars, output at 4 MB, and flowchart edges at 5000
  (because `A & B --> C & D` multiplies). See `lib.rs` constants. There are also recursion-depth
  limits (AGENTS.md).
- Preprocessing (front matter, `%%{init}%%`, comments) and detection are ports of Pele's ports of
  Mermaid's own. Config comes back as a generic YAML value tree, and each type reads its own
  section.

## 4. Text measurement and labels

- `text/measure.rs`: `width(text, size, style)` sums 600/1000 em per glyph, 1200 for East-Asian
  wide or supplementary characters, and 0 for combining or zero-width characters. **Style (bold or
  italic) is ignored.** No font tables, no canvas, no DOM, and no font metrics embedded in WASM.
- Pele itself has a pluggable `TextMeasurer`. Ondine uses only Pele's monospace branch
  (`AGENTS.md` "Text widths"). The parity harness `test/Pele.ts` injects the same measurer into
  Pele so that the bytes match.
- To make the assumption hold at render time, the root style pins the font:
  `font: <size>px monospace`, letter-spacing and word-spacing normal, kerning and ligatures off
  (`svg/theme.rs::font_style`). The font stack is `ui-monospace, SFMono-Regular, Menlo, ...`,
  overridable through `--ondine-font`.
- `text/label.rs` (6.5k lines) lays out labels as lines of styled spans. It handles inline HTML
  emphasis, markdown emphasis, `<br>`, Font Awesome icons, and wrapping, **all as SVG `<text>`/`<tspan>`
  with no `foreignObject`** (grep finds no `foreignObject` in the compiler).
- Known gap: emoji with a variation selector are measured as one column but drawn as two
  (`src/Screenshot.test.ts` overflow list, `.agents/design.md`).

## 5. Layout

- `layout/layered.rs` is a Sugiyama-style layered layout ported from Pele. Ranks run down y, and
  callers rotate for other directions. Its stated priorities are edge distinguishability (`spread`,
  `assign_tracks`), then crossing reduction (`reduce_crossings`), then short and simple edges
  (`align_labels`, `straighten`, `settle`, `snap`), then edges meeting the middle of a side.
- `layout/compound.rs` lays out each group on its own, places it as a box in its parent, and gives
  cross-boundary edges ports. Directions can be set per group.
- `layout/lanes.rs` handles swimlanes: shared ranks across lanes.
- Non-graph types (sequence, gantt, pie, xychart, ...) lay out inside their own `render.rs`.
- Rules (AGENTS.md "Layout and Emission"): near-linear or bounded passes, fixed iteration counts,
  **deterministic** tie-breaks by authored order, and no hash-order iteration. Graphs are `Vec`
  arenas indexed by `u32` newtypes, with no `Rc<RefCell>`.
- `autoDirection` / `directionBreakpoint` options can flip LR to TD when the diagram does not fit
  `maxWidth`. This is a responsive feature Mermaid lacks.

## 6. SVG generation

- The SVG is emitted as a string into one preallocated `String` with `push_str`. There is **no
  `format!`/`write!`** on wasm-reachable paths because `core::fmt` costs kilobytes. All numbers go
  through one formatter with fixed precision and no `-0` (`yaml::push_number`, `util/float.rs`).
- `svg/shapes.rs` (~4k lines) holds node shapes (sizes, outlines, edge attach points). Unknown
  shapes fall back to `rect`.
- `svg/edges.rs` (~4.4k lines) holds paths, markers (`arrow_point`/`circle`/`cross`), labels, and
  self-loops.
- `svg/root.rs` builds the document root: viewBox, responsive sizing, `idPrefix` for unique IDs on
  a shared page.
- The output is inert. There is no `<script>`, no `on*` handlers, and no `foreignObject`. Links come
  out as data (`Rendered.links`) for the host to wire up.

## 7. JS/WASM boundary and API

- **wasm-bindgen is not used.** `crates/wasm/src/lib.rs` exports `reset()`, `alloc(len)`, and
  `render(src_ptr, src_len, opts_ptr, opts_len, now: f64) -> ptr`, plus `model(...)` behind a
  feature for tests.
  - Memory is a **bump arena** used as `#[global_allocator]`. `reset()` empties it before each
    render, and dealloc/realloc reclaim only the last allocation.
  - The result is one buffer: a status byte, then `u32`-length-prefixed fields. On success these are
    type, width, height, links, and svg. On error they are code, type, line, column, snippet, and
    message.
- `src/internal/Wasm.ts` (~150 lines) handles the JS side. It uses `TextEncoder.encodeInto` directly
  into linear memory, re-creates views after memory growth, and decodes with `DataView`. The Wasm
  module imports nothing (`new WebAssembly.Instance(module, {})`).
- `src/Render.ts`: `create({ modules: { all | flowchart | ... } }).render(source, options)`.
  - It tries the first module. If that module reports `unsupported-diagram` with a detected type, it
    lazily instantiates the module for that type. That is how per-type modules get routed.
  - It throws `RenderError` with `code`, `line`, `column`, `snippet`, and `type`.
- **Options are Pele's `RenderOptions`:** `autoDirection`, `directionBreakpoint`, `fontSize`,
  `idPrefix`, `limit`, `maxEdges`, `maxWidth`, `now`, `outputLimit`, `padding`, `responsive`, plus
  link and image controls (`links`, `linkSchemes`, `linkRel`, `images`, `imageSchemes`) parsed in
  `lib.rs::options_from_json`. Unknown fields are ignored, as in Pele.
  - **Pele's `measurer` option is not exposed** because measurement is fixed.
  - Options travel as JSON text and `now` travels separately. The compiler reads no clock, which is
    why gantt output is deterministic.
- Entry points (`package.json` exports):
  - `ondine`: `mount()` only, about 210 B.
  - `ondine/compiler`: Node, loads `all.fast.generated.wasm` from disk.
  - `ondine/compiler/wasm` plus `ondine/compiler/wasm/<type>` (base64-inlined) or `<type>.wasm` (raw,
    for Workers that ban runtime compilation).
  - `ondine/vite`, `ondine/remark`, and the `ondine` CLI (`src/cli/bin.ts`, using `incur`).
- The render is **synchronous**. Instantiation is sync from base64 or from a precompiled `Module`.

## 8. Build pipeline and size tricks

`scripts/build-wasm.ts`, `bench/size.md`:

- `cargo build -p wasm --features <type> --profile wasm --target wasm32-unknown-unknown`. One target
  directory per type, built in parallel, with a content-hash stamp to skip rebuilds.
- Profile `wasm`: `opt-level="z"`, `panic="abort"`, `lto="fat"`, `codegen-units=1`,
  `strip="symbols"`.
- If the pinned **nightly** is present, the build adds `-Zbuild-std=std,panic_abort`,
  `-Zbuild-std-features=optimize_for_size`, and `RUSTFLAGS=-Cpanic=immediate-abort`, which removes
  `core::fmt`. It falls back to stable with larger output.
- **`wasm-opt -Oz --converge --low-memory-unused --strip-debug --strip-producers`** from the npm
  `binaryen` package, pinned so output is reproducible.
- Code-level size work recorded in `bench/size.md`:
  - a hand-written float parser replacing core's (-12 KB gzip)
  - a precomputed star table
  - a UTF-16 length counted from UTF-8 bytes
  - remaining bloat noted: 14 BTreeMap instantiations (17 KB raw), case-mapping tables, libm
    `hypot`/`fma`
- Flowchart size per optimization step:

  | Build | gzip |
  | --- | --- |
  | Baseline | 178 KB |
  | Final, nightly | 137 KB |
  | Stable | 161 KB |
  | O3 "fast" | 254 KB |

  - The z-build renders in about 12 ms per 174 vectors and the O3 build in about 7.2 ms.
  - Base64 inlining adds 30% gzip, so the raw `.wasm` export exists for that reason.
- Two profiles ship. **Size-optimized per-type modules** go to browsers and the Worker, and
  **`all.fast` (O3)** serves Node and the CLI.
- **Shared-core split was prototyped and rejected** (`bench/size.md` § Shared Core).
  - A page that loads a single type pays +10% (flowchart +6%), and cross-module calls are not
    inlined, so rendering is 2–10% slower.
  - It helps only when 2 or more types share a page (-15% to -24%).
  - Dynamic linking is not viable on `wasm32-unknown-unknown`.
- Speed vs Pele (Node, `bench/speed.md`, O3 module): 1.2x to 2.2x faster per type. Flowchart is 6.5
  ms vs 11.7 ms over 174 vectors. The README benchmarks in `mermaid-v13-approches` say "~equal" in
  the browser with the size build, which matches the z-build numbers (12 ms vs 11–12 ms).

## 9. Theming and config

- There is no Mermaid theme engine. Theming is done with **CSS custom properties** on the root:
  `--ondine-bg`, `-fg`, `-muted`, `-line`, `-surface`, `-surface-alt`, `-border`, `-accent`,
  `-critical`, `-stroke`, `-radius`, and `-font` (`svg/theme.rs::ROOT_STYLE`).
  - Private short aliases (`--_bg`, `--_fg`, ...) keep the markup small.
  - `color-mix()` derives the alt surface.
  - Dark mode works without re-rendering.
- Mermaid's `theme`/`themeVariables` are parsed (via front matter or init) but **ignored**. This is
  recorded as divergence `theme-colors` in `test/oracles/README.md`.
- Author styles (`style`, `classDef`, `linkStyle`) still apply. `svg/theme.rs::resolve_style`
  maps a whitelist of shape and text CSS props.
- Per-diagram config comes from the YAML value tree (for example `useMaxWidth: false` forces a fixed
  size, `lib.rs`). Pele-documented divergences include not moving `init.config` into the type
  section, and some YAML reader differences.

## 10. Security

- Output is meant to be safe under Mermaid's `securityLevel: strict` without DOMPurify.
  - Every authored string is escaped (`svg/builder.rs`).
  - There are no scripts, event handlers, or external references, and no `foreignObject`.
  - IDs are unique per render through `idPrefix`.
- `util/url.rs` ports Mermaid's `sanitizeUrl` (the `javascript|data|vbscript` check, with tests for
  entity, zero-width, and BOM tricks). It also adds host allow-lists, `linkSchemes`/`imageSchemes`,
  and `links: false`/`images: false` switches.
- Divergence `sanitized-text`: text is stored raw and escaped at draw time, not passed through
  DOMPurify the way Mermaid's DBs do it.
- DoS limits apply to input size, output size, and edge count, and recursion depth is bounded.
- The `compiler` crate has `unsafe_code = deny`. Unsafe exists only in the wasm adapter, where each
  block carries a `// SAFETY:` note. Clippy bans file, env, and clock access.

## 11. Testing

| Suite | File | What it checks |
| --- | --- | --- |
| Mermaid oracle | `test/oracles/Oracle.test.ts`, `README.md` | Runs real `mermaid@12.1.0` (jsdom) and Ondine's `model` export on 10.7k corpus sources and 2.3k seeded mutations, comparing accept/reject, detected type, and the projected DB model (8.4k models). Every disagreement must be listed in `Divergences.ts` (218 recorded, all shared with Pele). Larger sweeps covered 140k sources. |
| Grammar oracle | `test/oracles/Grammar.test.ts` | 19 **vendored Mermaid jison grammars** (`test/oracles/grammars/*.jison`) and `@mermaid-js/parser` for Langium types, fed directly. |
| Pele SVG parity | `src/Parity.test.ts` + `test/Pele.ts` | For every vector, Ondine's SVG must **equal Pele's byte-for-byte**. Pele runs with Ondine's monospace measurer, and its output is rewritten (`--pele-*` to `--ondine-*`, radius, series colors). 191k mutated sources were compared. |
| Screenshots | `src/Screenshot.test.ts` | Chromium sheets of every vector, light and dark, checked in under `src/__screenshots__`, with a viewBox overflow check. |
| Rust tests | `crates/compiler/tests/fixtures/<type>-parse.json` + inline `insta` | Parse fixtures ported from Mermaid's specs via Pele. Mocks and private unit tests are banned. |
| Packaging | `scripts/packed-consumer.test.ts`, `test/fixtures/consumer/` | Tests the packed tarball in a Vite consumer. |
| Benchmarks | `bench/Render.bench.ts`, `bench/chrome/*` | Benchmarks against Pele and Mermaid. |

The Pele parity and Mermaid model oracles are the main reasons the port could be done quickly and
safely. From the oracle README: "No Rust parser needed a fix."

## 12. What Rust buys beyond speed

- **One pure core that runs in every host.**
  - Node and the CLI use the O3 wasm. Browsers use size-optimized wasm. A **Cloudflare Worker**
    renders GitHub-embeddable SVG images from URL-encoded source (`.agents/plan.md` § GitHub
    Rendering; Workers need precompiled modules, which the raw `.wasm` exports provide).
  - It is not exposed as a native binary or crate today: `publish = false` and only the `wasm` cdylib
    is built. The CLI is TS over wasm.
  - Because `compiler::render(&str, &str, f64)` is a plain Rust fn with no I/O, native, C-ABI,
    Python (PyO3), Go, or WASI bindings would be trivial. The C ABI used for wasm is already
    language-neutral.
- **Determinism and isolation by construction.** There is no DOM, fonts, clock, env, or hash-order
  iteration. Node and the browser emit identical bytes, which makes build-time caching and SSR
  straightforward.
- **Per-type tree-shaking at the compiler level** through Cargo features. This is stronger than JS
  bundler tree-shaking across a registry.
- **Linear-memory arena with no GC.** Render time is predictable, but that is mostly a speed
  benefit.
- **Not bought.** Size is not the win: one flowchart module is about 137 KB gzip, while all of Pele
  is about 230 KB gzip (`plan.md`). Neither is maintainability: 125k lines with hand-written regex
  replacements.
- **ASCII as a by-product.** `src/cli/Ascii.ts` rasterizes the compiled SVG into a character grid.
  This works only because every glyph is exactly 0.6 em: one cell is 0.6 em by 1 em, so labels keep
  their columns. It is relevant to the mermaid-ascii discussion: a monospace-measured shared layout
  gives a "free" text backend.

## 13. Implications for "TS core now, Rust/WASM later"

Ondine is direct evidence that a **well-structured, pure TS renderer can be mechanically ported to
Rust in a short time**. The dates suggest weeks rather than months, though this is an inference.
The vectors were pinned on 17 Oct 2026, the compile-first decision is dated 19 Oct, and v0.0.3 was
out by 31 Oct. Most of the work was probably agent-driven, given the detailed AGENTS.md porting
rules. The port reached byte parity and ran 1.2–2.2x faster. What made Pele
portable, and what a v13 TS core should do on purpose:

1. **A pure-data pipeline: `string -> model -> layout -> string`.** No DOM, no `getBBox`, no D3
   selections, no DOMPurify in the core. Today's Mermaid measures text in the DOM during layout,
   which is the single biggest blocker. Rendering to a DOM tree should be a thin adapter outside
   the core, as Ondine's `mount()` is.
2. **Pluggable but pure text measurement.** Pele's `TextMeasurer` interface is the right shape. Ship
   a deterministic default (font-metric tables or monospace), and make browser canvas measurement
   an optional injected adapter. Anything that crosses into WASM later must be callable without a
   JS callback per glyph, or must be replaced with tables.
3. **No regex-heavy or generator-specific parsing in the core.** Hand-written lexers and
   recursive-descent parsers port line-for-line. Jison and Langium runtimes do not port. Chevrotain
   is in between (its token/first-match model mapped onto `common/tokens.rs`). If v13 moves to
   Chevrotain, keep grammars simple and keep semantic actions in plain DB code.
4. **Deterministic semantics written down.** Insertion-ordered maps only, stable sorts, explicit
   tie-breaks by authored order, a single number formatter with fixed precision, no `Date.now()` (pass
   `now` in), no `Math.random`, and positions in a defined unit (UTF-16 vs UTF-8). Ondine spent real
   effort emulating JS quirks: `Math.round`, UTF-16 offsets, `toLowerCase`, JS `Date`
   (`gantt/js_date.rs` is 1k lines). A TS core that avoids those quirks, or confines them to small
   modules, is cheaper to port.
5. **Plain data structures.** Index-addressed arrays for nodes, edges, and clusters, records instead
   of class hierarchies, no closures stored in models, and no global registries or singletons. This
   matches Ondine's "no global registration, mutable singletons, plugin frameworks" rule and
   conflicts with today's `registerDiagram` plus mutable DB-class design.
6. **Options as one serializable object, errors as typed values** (`code`, `line`, `column`,
   `snippet`, `message`). That object becomes the FFI contract unchanged, since JSON in and one
   buffer out is enough. Keep config handling (front matter, directives, YAML) inside the core so
   it ports with it.
7. **Theming through CSS variables, not computed colors in the core.** This removes khroma-style
   color math from the hot path and makes dark mode a CSS concern. If Mermaid keeps
   `themeVariables` for compatibility, isolate the derivation in a small pure module.
8. **Per-diagram modules with no cross-diagram imports.** This becomes per-type Cargo features
   (Mermaid's isolation rule already points this way). Keep the shared layout, SVG builder, and
   text code small, because every per-type wasm duplicates it (`bench/size.md` § Shared Core).
9. **Build the test oracle first.** The key asset is a corpus with byte-exact SVG expectations,
   plus a model-JSON projection per diagram type. If the v13 TS core exposes `parse() -> model JSON`
   and `render() -> SVG string` deterministically, a later Rust port can be gated on byte parity per
   type and shipped incrementally. Ondine's `create({modules})` per-type fallback shows how mixed
   TS/WASM coverage could coexist.
10. **Budget expectations.** WASM does not give a smaller download than a lean TS bundle: 137 KB
    gzip for flowchart vs about 230 KB for all of Pele. The gains are about 1.5–2x speed in a
    server or Node build, deterministic multi-host output, and native embeddability. The
    browser-size case for Rust is weak unless the core is AOT-compiled at build time, which is
    Ondine's main pitch.

Risks and caveats to carry forward:

- The port pins to Pele's layout quality and look. Mermaid-compatible appearance (themes, the
  `htmlLabels` `foreignObject`, proportional fonts) is explicitly out of scope.
- Proportional-font measurement in WASM would need embedded metric tables. Ondine avoided that by
  going monospace-only.
- It is MIT with a Pele notice. Upstream is young (v0.0.3).
