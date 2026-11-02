# Mermaid v13 — decision log (grilling session, 2026-10-31)

Research inputs: `research/` (pele, ondine, mermaid-ascii, mermaid-current, parser-and-tooling);
benchmarks in the sibling `mermaid-v13-approches` repo (README.md, reports/).
Later decisions supersede earlier ones where they conflict; superseded text is marked.

## Round 1 (settled)

| # | Decision |
|---|---|
| D1 | v13 is the next major of the `mermaid` npm package. Developed on branch `mermaid-v13`; alpha pre-releases published from there in parallel with v12. |
| D2 | Compat contract: syntax sacred for supported diagram types; visual output may change; config: unknown keys warn (never error), **keep as much config as possible** (refined by D22); `render/parse/initialize/run` keep their shapes, internals/`mermaidAPI` may go. |
| D3 | TypeScript first. Core must be a pure, DOM-free data pipeline so a Rust/WASM port stays possible; Rust is not a v13 deliverable. *(Amended by D46.)* |
| D4 | Core is `(text, options) → SVG string`, no DOM. Browser DOM only via a thin adapter (`run()`). (Measurement: D17.) |
| D5 | SVG-only labels; no htmlLabels/foreignObject. Markdown subset → tspans. Raw HTML escaped/stripped. KaTeX/icons later as optional plugins emitting SVG. |
| D6 | Safe by construction: no sanitizer, no `<script>`/`on*`/foreignObject, JS click callbacks removed, href with scheme allow-list, style/classDef validated per property, hard input limits on by default, `securityLevel` removed. **Interactivity is outside the library**: users stay on v12 or attach their own handlers. *(Amended by D47, D48, D61.)* |
| D7 | Small core + one package per diagram type (independently versioned) + optional heavy plugins (ELK, KaTeX, icons, handDrawn) + `mermaid` all-diagrams bundle with lazy loading. *(Amended by D59.)* |
| D8 | Milestone 1 = flowchart only, one built-in zero-dep layout, light/dark themes, SVG backend, conformance corpus. |
| D9 | Unsupported diagram types throw an "unsupported" error. No legacy v12 bridge. |
| D10 | Targets (core+flowchart): ≤ 80 KB gz, 0 runtime deps, ≥ 50× geomean vs Mermaid 12 dagre on the corpus, 100% corpus renders; measured in CI via the approaches harness. |
| D11 | ASCII backend is a v13 requirement (milestone 2); layout output must be a renderer-neutral data structure. *(Amended by D57.)* |
| D12 | Porting Pele code allowed with MIT attribution (THIRD_PARTY_NOTICES + headers); default to reimplementing. *(Amended by D66.)* |
| D13 | Requirements/design/ADRs as markdown in repo under `v13/docs/`; research reports move there; ~~tickets as GitHub issues in Mermaid-Chart/mermaid-v13~~ tickets as GitHub issues in **mermaid-js/mermaid-v13** (amended 2026-11-02, when v13 moved there) labelled `v13` + milestone. |

## Round 2

| # | Decision |
|---|---|
| D14 | Hand-written parsers, **no Chevrotain** (not even at runtime for tooling). Lean, AI-assisted authoring. Core 'parser kit' returns model + token spans + identifier occurrences + statement spans + multiple ranged diagnostics with statement-level recovery. jison/Chevrotain only as test oracles. Acceptance: N errors → N diagnostics; definition/references/folding correct on corpus; jison-style `hash.loc` shim for existing editors. (parser-and-tooling.md) *(Amended by D54, D68.)* |
| D15 | Parity oracle: `mermaid@12` compared against v13 over the external 10,000+ diagram test set, following the Chevrotain branch's pattern (`flow.parse-corpus.spec.ts` with `PARSE_FIXTURE_PATH`, `flow.db-parity.spec.ts` DB-snapshot comparison), plus e2e `.mmd`, docs examples, fuzzing; committed divergence list; port v12 unit specs per ported diagram. |
| D16 | No code merges v12→v13. Scheduled job bumps the oracle version; new syntax surfaces as oracle failures → tickets. |
| D17 | Pluggable measurer. Browser default: canvas `measureText` on the resolved font with web-font-aware cache. Node/workers default: bundled width tables. `deterministic: true` forces tables everywhere. Font from `--mermaid-font-family` var, system-ui fallback. |
| D18 | Milestone-1 layout: port Pele's layered layout (longest-path, barycenter, Brandes-Köpf, straightening, compound subgraphs w/ ports) behind a plain-data layout interface; DOMUS etc. can compete later via DDLT score. *(Amended by D66.)* |
| D19 | `availableWidth` responsive layout supported, opt-in (off by default). |
| D20 | **(A)**: keep `theme`/`themeVariables` vocabulary (P1); every theme variable exposed as same-named CSS var `--mermaid-<name>`; output uses `var(--mermaid-x, computed)`; easier = few base vars, derived via CSS. Superseded draft was: ~30 semantic CSS custom properties as `var(--token, fallback)`; `theme` (default/dark/neutral/forest/base) + `themeVariables` compile to fallbacks; other v12 themes dropped from core; no `<style>` by default; `theme: 'auto'` emits a vars-only `<style>` with `prefers-color-scheme`. *(Amended by D55.)* |
| D21 | (Principle P1 applies.) classDef/style: per-property allow-list → inline presentation attributes; auto-contrast text on user fills; rest dropped with warning. |
| D22 | Config: keep the v12 config; **only remove options for features v13 no longer supports** (e.g. `htmlLabels`, `securityLevel`, click callbacks); everything else keeps working (honoured as the owning feature/diagram lands); no global mutable state, per-call merge; `initialize()` sets DOM-adapter defaults; generated honoured-keys doc table. *(Amended by D48.)* |
| D23 | Interactivity hooks: `data-id` + semantic classes on nodes/edges/clusters; `click href` kept as scheme-checked static `<a>`; callbacks parsed and ignored with warning; tooltips → SVG `<title>`; per-render id prefix; byte-deterministic for same input+options+measurer. *(Amended by D47.)* |
| D24 | ASCII (M2): shared layout with monospace measurer + orthogonal routing → snapped to char grid from layout data; port mermaid-ascii golden files; cell-native layouts later; don't reuse its parser. *(Amended by D57.)* |
| D25 | Branch layout: `packages/core`, `packages/diagram-flowchart`, `packages/mermaid` = API + bundle; v12 sources deleted on branch (oracle via npm only); more packages as needed. |
| D26 | Render tests: vitest property tests on full corpus (well-formed, security allow-list, deterministic, no NaN); Playwright/Argos curated visual baseline; all-diagrams gallery page; approaches harness in CI enforces D10. |
| D27 | Targets: ES2022, evergreen ~2 yrs, Node ≥ 20, workers, Deno; no polyfills. |
| D28 | Alphas first private (`@mermaid-chart/mermaid` on GitHub Packages via publish-fork), public npm `mermaid@13.0.0-alpha.N` once M1 meets D10; Changesets pre mode publishing on every merge to `mermaid-v13`. |

## Principles

- **P1** Mermaid's existing behaviour and defaults are the baseline. Take from Pele (or others) only where it is demonstrably better.

## Round 3

| # | Decision |
|---|---|
| D29 | Accessibility: accTitle/accDescr → `<title>`/`<desc>`, `role="img"` + aria refs; labels as real `<text>`; built-in themes WCAG AA light+dark. |
| D30 | Typed `MermaidError {code,message,line,column,offset,length,expected?}` with original-source positions; no bomb SVG in core; DOM adapter optional themed error box; warnings in `RenderResult.warnings`, never console. *(Amended by D49.)* |
| D31 | Limits: 50k chars, 5,000 edges, node cap, nesting cap, output-size cap; integrator-configurable only (not from within a diagram). |
| D32 | Keep registerExternalDiagrams, registerLayoutLoaders, registerIconPacks (stub), detectType; setParseErrorHandler kept but deprecated (typed error); remove `mermaidAPI` object; add `renderSync()` for already-loaded types. *(Amended by D51.)* |
| D33 | DOM adapter: `run()` as today; new `mount()` (resize re-render when availableWidth, re-measure after fonts load, no-op on theme change); no zoom/pan in core. |
| D34 | Porting order: M3 sequence/class/state/ER; M4 gantt/pie/mindmap/timeline/gitGraph/journey/quadrant; M5 rest; each ships as its own package once oracle-green. |
| D35 | Plugin contract: pure `{id, detector, parse, layout?, render → SvgNode tree, ascii?}`; core supplies measurer/tokens/escaping SVG writer/limits. **Plugins must kick in on install with zero/minimal config (Karma-style).** Discovery: D40. *(Amended by D52, D70.)* |
| D36 | REQUIREMENTS.md with R-ids, Must/Should/Could, rationale → decision log, acceptance check; DESIGN/ADRs/tickets cite R-ids. |
| D37 | Parser-kit outputs in M1; `@mermaid-js/language-service` (diagnostics, definition, references, rename, hover, folding, semantic tokens, completion; CodeMirror+Monaco adapters; LSP wrapper) as milestone M2.5. |
| D38 | Diagnostics: line/col, snippet+caret, ≤5 grouped expectations, unclosed constructs point to opener; snapshot-tested. |

## Round 4

| # | Decision |
|---|---|
| D39 | Derived theme colours computed in CSS via `color-mix()` with computed fallbacks (no khroma). |
| D40 | Plugin discovery: package.json `"mermaid"` manifest (eager tiny detector, lazy entry); `mermaid` depends on all first-party diagram packages, lazily imported; third-party/heavy: Node auto-scan of node_modules, one-line unplugin `mermaid/plugin` for bundlers, CDN self-registering script; `registerExternalDiagrams()` escape hatch. *(Amended by D52.)* |
| D41 | CDN build lazy-loads first-party diagram packages from the configured CDN base only (never from diagram text). |

## Input: PR mermaid-js/mermaid#8635 (Sidharth, open)
`getConfig()` deep-cloned ~970 keys (~220 µs) per call, several calls per node/edge → **52–65% of render time** (flowchart/class/sequence). Frozen shared snapshot: 1.7–2.8× faster on small/medium; 500-node flowchart only 1.6× (2285→1444 ms) because ELK layout dominates. Lessons: v12 slowness is partly accidental cost, not only DOM measurement; ELK default is the large-graph bottleneck; config should be resolved once and threaded explicitly.

## Round 5

| # | Decision |
|---|---|
| D42 | Config resolved once per render into a frozen object and passed explicitly to parser, layout and renderer; no global `getConfig()`-style lookups in core or diagram packages (lint-enforced); plugins receive config as an argument. *(Amended by D72.)* |
| D43 | Benchmarks report per-stage time (parse, measure, layout, serialise); fixed fixtures include Pele/#8635 set (7-, 50-, 500-node flowchart, sequence, class) + the 158-diagram corpus; CI fails on >10% per-stage regression on a reference runner. |
| D44 | Small parallel v12 performance track: land #8635, evaluate switching v12 default layout from ELK to dagre (minor at least). v13 remains the main investment. |
| D45 | The 50× target is measured against frozen `mermaid@12.2.0` (dagre); current v12 reported for information. |

## Round 6 — requirements review (2026-11-02)

Made while editing REQUIREMENTS.md in review. Where a row amends or replaces an earlier decision, the earlier row carries a pointer here.

| # | Decision |
|---|---|
| D46 | Rust/WASM: possible, not planned. No requirement or plan to build one; core only must not block it (amends D3). R-ARCH-7, P3. |
| D47 | Click callbacks come back as a first-party **interactions** extension plugin, available from M1. Core parses `click … callback/call` into the model and emits stable ids; the plugin binds handlers in the DOM after render. Opt-in by installing it; diagram text cannot enable it. Without it, callbacks are ignored with a warning. Callback config keys move to the plugin (amends D6, D23). R-PLUG-9, R-SVG-5, R-CONF-1. |
| D48 | `securityLevel` is kept with two levels: default (scheme allow-list http/https/mailto/relative) and `strict` (relative links only). Sandbox/iframe mode is removed; `loose`, `antiscript`, `sandbox` are treated as default with a warning (amends D6, D22). R-SEC-4, R-SEC-6. |
| D49 | Error behaviour matches v12: a failing diagram is replaced by an error image, `run()` carries on with the rest, `suppressErrorRendering` turns the image off, and `render()` still rejects with a typed `MermaidError` (replaces D30's "no bomb SVG in core"; the typed error stays). R-ERR-3. |
| D50 | Error messages are written for authors: Mermaid terms, never token or rule names, with a fix hint where clear; reviewed side by side with v12's and must be clearly better. R-ERR-5. |
| D51 | Two-phase rendering: async `prepare(text)` finds and loads everything a diagram needs (diagram package, icon packs, math, layout engine); sync, pure `renderSync` uses only what is loaded and throws `NotLoadedError` listing what is missing (or renders placeholders with a warning, when asked). `render()` = prepare + renderSync. `preload({ types, iconPacks, … })` for hosts that cannot await (amends D32). R-API-2. |
| D52 | Two kinds of plugin. Diagram plugins as in D35. **Extension plugins** register hooks for any diagram type: `postParse(ast)`, `postLayout(layoutModel)`, `postRender(svgTree)` (before serialisation) and, in the DOM adapter, `afterMount(element)`. Hooks run in registration order and their output still passes the allow-list. The manifest gets `kind: diagram | extension`; extensions have no detector (amends D35, D40). R-PLUG-2, R-PLUG-3. *(Amended by D70.)* |
| D53 | Parse output includes a typed, documented AST. Every node has a stable id and source span, and every rendered element from an AST node carries that id in an allow-listed data attribute, so editors can map source ↔ diagram both ways. R-PARSE-8. *(Amended by D69.)* |
| D54 | Each diagram type has a normative grammar file (EBNF with lexer modes). The hand-written parser must conform; a parser generated from the grammar is dev/CI-only (differential oracle, fuzz-sentence generator). The grammar also generates the syntax highlighters (TextMate, Monarch, Lezer) and the syntax reference docs. Nothing generated ships at runtime (refines D14). R-PARSE-9. |
| D55 | **redux** is a built-in theme and the default when no theme is set. Every diagram type supports it, and all types rendered in redux look like one family through shared tokens (palette, stroke widths, corner radii, typography, spacing) (amends D20). R-THEME-6, R-THEME-11. |
| D56 | Markdown strings accept bullet lists (`- ` / `* `, one nesting level), rendered as indented tspan lines with a bullet glyph; recognised only inside markdown strings. R-TEXT-11. |
| D57 | Layout depends only on an injected measurer, never on a backend. ASCII gets its sizes by running layout with a character-grid measurer (refines D11, D24). R-ARCH-3. *(Amended by D70.)* |
| D58 | ASCII support is opt-in per diagram type, declared in the manifest. `supportsFormat(type, 'ascii')` checks up front; an unsupported type throws `UnsupportedFormatError` (never an approximation); features with no text form are dropped with a warning; docs carry a type × format matrix. R-ASCII-5. |
| D59 | Only core has a size budget. Later diagram packages are optional plugins and have no budget for now (amends D7). R-PERF-8. |
| D60 | The config reference doc is generated from the JSON schema, which is the single source of truth: each key carries type, default, description and compatibility data (honoured or not, since which version, removed or moved, replacement). R-CONF-4. |
| D61 | No sanitizer is needed, in v13 or by integrators displaying its output. Before the first alpha this is verified (external review, XSS/GHSA corpus + fuzzing, threat model); an optional sanitizer is reconsidered only if gaps remain (A-3). R-SEC-1. |
| D62 | `click href` keeps the v12 link target (`_self`, `_blank`, `_parent`, `_top`); `_blank` also gets `rel="noopener noreferrer"`. R-SVG-4. |
| D63 | Drop-in upgrade: bumping to v13 with unchanged install and setup code keeps working. Which features a default install includes is decided in release step two (A-2); not required for the draft implementation. R-COMPAT-10. |

Also: R-SEC-8 (contrast ink on author fills) moved to R-THEME-12. New open items: O-7 (port Pele's layout or depend on it), A-1 (images in labels), A-2 (release scope), A-3 (security verification).

## Round 7 — design review (2026-11-02)

Made while editing REQUIREMENTS.md and DESIGN.md in review.

| # | Decision |
|---|---|
| D64 | All 11 v12 themes are kept for parity, in core, each as its own lazily imported `ThemeSpec` file. M1 ships `redux`, `default`, `dark`, `forest`, `neutral`, `base`; the rest follow by M3. R-THEME-7 becomes Must (resolves O-2). |
| D65 | The external 10,000+ diagram oracle is run by QA, not in CI. CI uses the in-repo corpora; where QA reads the set from is still open (R-TEST-1, O-3). |
| D66 | Pele's layered layout is **ported** into core and owned by us, with MIT attribution, not taken as a dependency. Upstream fixes are brought over by hand (resolves O-7; refines D12, D18). |
| D67 | Preprocessing never rewrites the source text. One shared front-matter parser in core built on the parser kit; directives and `%%` comments stay in place as trivia; CRLF handled by the lexer; entities decoded per label. No SourceMap: all ranges are original offsets. Any future rewrite needs `Edit` records and an ADR. |
| D68 | The jison-style `hash.loc` compatibility shim is dropped; R-PARSE-6 is removed. Editors use `MermaidError` positions and diagnostics (amends D14). |
| D69 | AST ids are semantic, built from the user's names: `n:A` (`n:A@2` for a later mention), `e:A>B` (`#2` for parallel edges), `s:<id>`, and kind + ordinal for unnamed statements (`st:3`). They survive edits elsewhere in the text (refines D53). |
| D70 | Layout output is generic per plugin (`L`). `LayoutGraph`/`LayoutModel` are the contract for graph diagrams only; non-graph diagrams define their own layout type. `postLayout` hooks receive `{ kind, diagram, layout }` and must return the same kind. A non-graph stub plugin in CI guards this (refines D35, D52, D57). |
| D71 | No automated ΔE colour-match test against v12. Derived colours aim to resemble v12; all diagrams, colours included, are reviewed by hand at the end. WCAG AA contrast stays automated (R-THEME-9). |
| D72 | Config is resolved early and frozen: settled before the body is parsed, shared by reference (never cloned), cached by `prepare`; `initialize()` swaps in a new frozen defaults object rather than mutating (refines D42). |
| D73 | Metric tables for Trebuchet MS, Verdana and Arial in M1; `system-ui` is ruled out as default (a different face per OS, so no table can match it). The final default font is settled before 13.0. |
| D74 | Confirmed from DESIGN review: typed `SvgWriter` with streaming and tree backings (ADR-3); `output.cssVariables: false`; v12 class names kept, with structural changes listed in MIGRATION.md; `bindFunctions` set only by the interactions plugin; callback names resolved as in v12 (on `window`), gated by installing the plugin. |

Also: O-1 settled in DESIGN; O-6 targets (R-PERF-9 ≤ 15 ms ready, R-THEME-5 ≤ 8 base variables) accepted.
