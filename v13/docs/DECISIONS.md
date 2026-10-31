# Mermaid v13 — decision log (grilling session, 2026-10-31)

Research inputs: `research/` (pele, ondine, mermaid-ascii, mermaid-current, parser-and-tooling);
benchmarks in the sibling `mermaid-v13-approches` repo (README.md, reports/).
Later decisions supersede earlier ones where they conflict; superseded text is marked.

## Round 1 (settled)

| # | Decision |
|---|---|
| D1 | v13 is the next major of the `mermaid` npm package. Developed on branch `mermaid-v13`; alpha pre-releases published from there in parallel with v12. |
| D2 | Compat contract: syntax sacred for supported diagram types; visual output may change; config: unknown keys warn (never error), **keep as much config as possible** (refined by D22); `render/parse/initialize/run` keep their shapes, internals/`mermaidAPI` may go. |
| D3 | TypeScript first. Core must be a pure, DOM-free data pipeline so a Rust/WASM port stays possible; Rust is not a v13 deliverable. |
| D4 | Core is `(text, options) → SVG string`, no DOM. Browser DOM only via a thin adapter (`run()`). (Measurement: D17.) |
| D5 | SVG-only labels; no htmlLabels/foreignObject. Markdown subset → tspans. Raw HTML escaped/stripped. KaTeX/icons later as optional plugins emitting SVG. |
| D6 | Safe by construction: no sanitizer, no `<script>`/`on*`/foreignObject, JS click callbacks removed, href with scheme allow-list, style/classDef validated per property, hard input limits on by default, `securityLevel` removed. **Interactivity is outside the library**: users stay on v12 or attach their own handlers. |
| D7 | Small core + one package per diagram type (independently versioned) + optional heavy plugins (ELK, KaTeX, icons, handDrawn) + `mermaid` all-diagrams bundle with lazy loading. |
| D8 | Milestone 1 = flowchart only, one built-in zero-dep layout, light/dark themes, SVG backend, conformance corpus. |
| D9 | Unsupported diagram types throw an "unsupported" error. No legacy v12 bridge. |
| D10 | Targets (core+flowchart): ≤ 80 KB gz, 0 runtime deps, ≥ 50× geomean vs Mermaid 12 dagre on the corpus, 100% corpus renders; measured in CI via the approaches harness. |
| D11 | ASCII backend is a v13 requirement (milestone 2); layout output must be a renderer-neutral data structure. |
| D12 | Porting Pele code allowed with MIT attribution (THIRD_PARTY_NOTICES + headers); default to reimplementing. |
| D13 | Requirements/design/ADRs as markdown in repo under `v13/docs/`; research reports move there; tickets as GitHub issues in Mermaid-Chart/mermaid-v13 labelled `v13` + milestone. |

## Round 2

| # | Decision |
|---|---|
| D14 | Hand-written parsers, **no Chevrotain** (not even at runtime for tooling). Lean, AI-assisted authoring. Core 'parser kit' returns model + token spans + identifier occurrences + statement spans + multiple ranged diagnostics with statement-level recovery. jison/Chevrotain only as test oracles. Acceptance: N errors → N diagnostics; definition/references/folding correct on corpus; jison-style `hash.loc` shim for existing editors. (parser-and-tooling.md) |
| D15 | Parity oracle: `mermaid@12` compared against v13 over the external 10,000+ diagram test set, following the Chevrotain branch's pattern (`flow.parse-corpus.spec.ts` with `PARSE_FIXTURE_PATH`, `flow.db-parity.spec.ts` DB-snapshot comparison), plus e2e `.mmd`, docs examples, fuzzing; committed divergence list; port v12 unit specs per ported diagram. |
| D16 | No code merges v12→v13. Scheduled job bumps the oracle version; new syntax surfaces as oracle failures → tickets. |
| D17 | Pluggable measurer. Browser default: canvas `measureText` on the resolved font with web-font-aware cache. Node/workers default: bundled width tables. `deterministic: true` forces tables everywhere. Font from `--mermaid-font-family` var, system-ui fallback. |
| D18 | Milestone-1 layout: port Pele's layered layout (longest-path, barycenter, Brandes-Köpf, straightening, compound subgraphs w/ ports) behind a plain-data layout interface; DOMUS etc. can compete later via DDLT score. |
| D19 | `availableWidth` responsive layout supported, opt-in (off by default). |
| D20 | **(A)**: keep `theme`/`themeVariables` vocabulary (P1); every theme variable exposed as same-named CSS var `--mermaid-<name>`; output uses `var(--mermaid-x, computed)`; easier = few base vars, derived via CSS. Superseded draft was: ~30 semantic CSS custom properties as `var(--token, fallback)`; `theme` (default/dark/neutral/forest/base) + `themeVariables` compile to fallbacks; other v12 themes dropped from core; no `<style>` by default; `theme: 'auto'` emits a vars-only `<style>` with `prefers-color-scheme`. |
| D21 | (Principle P1 applies.) classDef/style: per-property allow-list → inline presentation attributes; auto-contrast text on user fills; rest dropped with warning. |
| D22 | Config: keep the v12 config; **only remove options for features v13 no longer supports** (e.g. `htmlLabels`, `securityLevel`, click callbacks); everything else keeps working (honoured as the owning feature/diagram lands); no global mutable state, per-call merge; `initialize()` sets DOM-adapter defaults; generated honoured-keys doc table. |
| D23 | Interactivity hooks: `data-id` + semantic classes on nodes/edges/clusters; `click href` kept as scheme-checked static `<a>`; callbacks parsed and ignored with warning; tooltips → SVG `<title>`; per-render id prefix; byte-deterministic for same input+options+measurer. |
| D24 | ASCII (M2): shared layout with monospace measurer + orthogonal routing → snapped to char grid from layout data; port mermaid-ascii golden files; cell-native layouts later; don't reuse its parser. |
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
| D30 | Typed `MermaidError {code,message,line,column,offset,length,expected?}` with original-source positions; no bomb SVG in core; DOM adapter optional themed error box; warnings in `RenderResult.warnings`, never console. |
| D31 | Limits: 50k chars, 5,000 edges, node cap, nesting cap, output-size cap; integrator-configurable only (not from within a diagram). |
| D32 | Keep registerExternalDiagrams, registerLayoutLoaders, registerIconPacks (stub), detectType; setParseErrorHandler kept but deprecated (typed error); remove `mermaidAPI` object; add `renderSync()` for already-loaded types. |
| D33 | DOM adapter: `run()` as today; new `mount()` (resize re-render when availableWidth, re-measure after fonts load, no-op on theme change); no zoom/pan in core. |
| D34 | Porting order: M3 sequence/class/state/ER; M4 gantt/pie/mindmap/timeline/gitGraph/journey/quadrant; M5 rest; each ships as its own package once oracle-green. |
| D35 | Plugin contract: pure `{id, detector, parse, layout?, render → SvgNode tree, ascii?}`; core supplies measurer/tokens/escaping SVG writer/limits. **Plugins must kick in on install with zero/minimal config (Karma-style).** Discovery: D40. |
| D36 | REQUIREMENTS.md with R-ids, Must/Should/Could, rationale → decision log, acceptance check; DESIGN/ADRs/tickets cite R-ids. |
| D37 | Parser-kit outputs in M1; `@mermaid-js/language-service` (diagnostics, definition, references, rename, hover, folding, semantic tokens, completion; CodeMirror+Monaco adapters; LSP wrapper) as milestone M2.5. |
| D38 | Diagnostics: line/col, snippet+caret, ≤5 grouped expectations, unclosed constructs point to opener; snapshot-tested. |

## Round 4

| # | Decision |
|---|---|
| D39 | Derived theme colours computed in CSS via `color-mix()` with computed fallbacks (no khroma). |
| D40 | Plugin discovery: package.json `"mermaid"` manifest (eager tiny detector, lazy entry); `mermaid` depends on all first-party diagram packages, lazily imported; third-party/heavy: Node auto-scan of node_modules, one-line unplugin `mermaid/plugin` for bundlers, CDN self-registering script; `registerExternalDiagrams()` escape hatch. |
| D41 | CDN build lazy-loads first-party diagram packages from the configured CDN base only (never from diagram text). |

## Input: PR mermaid-js/mermaid#8635 (Sidharth, open)
`getConfig()` deep-cloned ~970 keys (~220 µs) per call, several calls per node/edge → **52–65% of render time** (flowchart/class/sequence). Frozen shared snapshot: 1.7–2.8× faster on small/medium; 500-node flowchart only 1.6× (2285→1444 ms) because ELK layout dominates. Lessons: v12 slowness is partly accidental cost, not only DOM measurement; ELK default is the large-graph bottleneck; config should be resolved once and threaded explicitly.

## Round 5

| # | Decision |
|---|---|
| D42 | Config resolved once per render into a frozen object and passed explicitly to parser, layout and renderer; no global `getConfig()`-style lookups in core or diagram packages (lint-enforced); plugins receive config as an argument. |
| D43 | Benchmarks report per-stage time (parse, measure, layout, serialise); fixed fixtures include Pele/#8635 set (7-, 50-, 500-node flowchart, sequence, class) + the 158-diagram corpus; CI fails on >10% per-stage regression on a reference runner. |
| D44 | Small parallel v12 performance track: land #8635, evaluate switching v12 default layout from ELK to dagre (minor at least). v13 remains the main investment. |
| D45 | The 50× target is measured against frozen `mermaid@12.2.0` (dagre); current v12 reported for information. |
