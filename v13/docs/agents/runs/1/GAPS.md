# Cross-ticket gaps (orchestrator-maintained) — owners must close these

**Size policy (maintainer, 2026-11-02):** size is deferred until just before M1 closes; the 80 KB budget may be raised 10–15%. Do not optimise for bytes or split code for size during tickets — just measure and report your gz size in the handoff.

## For #15 (mermaid API / pipeline)
- Wire preprocess (#5) → resolveConfig (#7): v12 moves the init/directive `config` key into the diagram's section; secure-key filter; `securityLevel` loose/antiscript/sandbox → default with warning (#7/#12 left it).
- Map `layout: dagre|elk` → `layered` in the layout registry (#7 note); `registerLayoutLoaders` + `layout:` selection (#11 left it).
- Import canvasMeasurer/selectMeasurer from packages/mermaid/src/measurer.ts (#9); wire `deterministic`, `fontFamily`; prove custom-measurer and deterministic criteria through render() (#9). Decide: integrator measurer vs deterministic:true (currently integrator wins).
- Bracket stages with stageStart/stageEnd from @mermaid-js/core/timing (#3); after pipeline works, flip bench gate mode default to enforce (#3).
- Flowchart with no user theme: v12 flowchart section default `theme: redux-color`/`look: neo` vs D55 redux default (#13 decides).
## For #8 (flowchart parser)
- Mermaid `#quot;` entity syntax decoding in labels (#10 left it); v12 `="x"`→`='x'` in HTML tags (#5 left it).
- Use parseYaml from @mermaid-js/core/preprocess for `@{}` shape data.
- Register flowchart in conformance PARITY_SUITES (#4).
## For #14 (renderer)
- Backing-parity and v12 XSS sources through render() over the e2e corpus (#12).
- Parser-produced LayoutGraph DDLT fixtures in diagram-flowchart (#11). v12's extra 25px rank spacing in subgraphs not reproduced (#11).
- Plain-label wrapping at wrappingWidth decision (#10).
## For #18 (visual/Playwright)
- Restore Playwright deps/dev server (#2 parked e2e/). Late-font canvas test, Node-vs-browser equality (#9). Theme browser tests (#13).
## Size (bench #3 gate)
- parser kit 3.2 KB vs 2 KB; layout 20.6 KB vs 18 KB; config generated keys ~16 KB source unmeasured.
## Added after #13
- #14: call theme.rootStyle() only after the body is rendered (it lists used vars only) — render body into its own writer or defer root style. `theme:'auto'` uses w.styleSheet(themeStyleSheet(...)) + data-p root attr; assertInert(svg,{themeStyle:true}).
- #18: browser re-theme test (--mermaid-primaryColor), emulated prefers-color-scheme for auto, JS-fallback vs browser color-mix equality.
- Size: svg+theme ≈14.0 KB gz vs 8 KB line. Cumulative overrun vs DESIGN §14 lines ≈ 10 KB (= all headroom); the 80 KB gate in bench decides.
- D71 hand review of colours vs v12 still pending (human).
## Added after #8
- #15: build MermaidError text on core parser-kit `formatDiagnostic` (snippet+caret). Pass config into flowchart parse options `maxEdges`, `flowchart.inheritDir` and mark those keys honoured.
- #17 (fuzz/limits): fuzz-only preprocess differences — directive ranges vs v12 directiveRegex (unclosed `%%{init: x`, directive inside a label); front-matter YAML stricter than js-yaml in some cases. Decide and list as divergences or fix.
- Bare `subgraph` without id: v13 accepts, v12 throws TypeError; not in corpus → record a decision (divergence) when it appears.
- #21: grammar .ebnf not started; lexer parity corpus is committed (reuse it for the differential).
- Size: flowchart lexer+parser+model 16.5 KB gz vs 9 KB line (parser.ts messages/hints/AST, lexer.ts).
## Added after #14
- #15: replace `renderForTest` (@mermaid-js/diagram-flowchart/testing) with render(); flowchart `render` writes the whole <svg> document — don't wrap it. Icons: ICON_UNAVAILABLE warning (registerIconPacks stub). DECIDED (maintainer): new config default level `default` (allow-list); `strict` = relative-only; loose/antiscript/sandbox → default + warning; MIGRATION entry + D75. Owned by #15.
- #18: colours/line height vs v12 visual check; step animation (step/stepNumbers/stepDuration) not drawn; undocumented v12 shapes (classBox, erBox, usecase*, bpmn-*) draw as rect.
- Layout gap still open: v12's extra 25px rank spacing inside subgraphs.
- Size: rough bundle of all core+flowchart exports ≈ 79.3 KB gz.
## Added after #21
- #17: core parseYaml accepts some shape data js-yaml rejects (found by the #21 sentence generator; v12 rejects, v13 accepts) — fix or list as divergence. Use the #21 sentence generator (tools/gen-grammar) as fuzz input.
- Parser gap (for code review pass): a semantic error (YAML, linkStyle index) stops the statement before its separator, so a later syntax error in that statement is unreported.
## Added after #15 (public API merged)
- `renderForTest` and `@mermaid-js/diagram-flowchart/testing` are DELETED. Test through `render()`/`renderSync()` or `createMermaid()` (isolated API object) from `mermaid`. Core pipeline is `@mermaid-js/core` (src/pipeline/). `flowchart.parse(text, ctx)`; raw options via `parseFlowchart`.
- #16: add the `run` signature check to packages/conformance/src/api-types.spec.ts (only RunOptions pinned now).
- #13/#16: `theme: 'auto'` missing from the schema enum (tests cast it) — add it.
- #17: render() must surface LIMIT errors through the pipeline in @mermaid-js/core.
- #18: CI smoke render runs on node20 only; deno/worker/chromium/firefox/webkit still echo.
- Kept v12 detector regexes verbatim (incl. c4's unanchored match) per P1/D2 detection-order parity.
- Size: flowchart load ≈ 81.9 KB gz; bench gate default is `enforce` → bench job fails on size until the deferred budget decision.
## Added after #19 (MIGRATION.md merged)
- #16, #17, #20, #22, #23, #24: update the MIGRATION.md rows marked "(later in M1)" for your feature (run/mount/startOnLoad, interactions plugin, browser bundle, limits). tools/gen-config/src/migration.spec.ts checks coverage.
- #20: `.changeset/config.json` baseBranch was set to `develop` by #19 — WRONG for v13 (R-REL-1: development on `mermaid-v13`). Set it to `mermaid-v13`.
- `flowchart.useMaxWidth` still `pending` (declared on the shared base definition) — #16/review pass.
## Added after #22 (extension plugins merged)
- #16: mount/run must call `result.bindFunctions?.(el)` exactly once after inserting the svg (calling twice runs afterMount twice).
- #23: hooks get per-extension `state` scratch object; `afterMount(el, result, state)`; postParse → state → afterMount is the callback handoff. See tickets/22.md.
- Review pass: core/src/preprocess/stress.spec.ts timing test flaked once under load — make its bound robust (ratio-based / retries) without weakening linearity.
- Not built (M3 scope, R-PLUG-5): Node/bundler manifest discovery; registry generator doesn't use readManifest.
## Added after #24
- Design question (maintainer): first-party detectors run first (ADR-6), so for a type v13 hasn't ported (e.g. sankey), the built-in detector claims it and throws UNSUPPORTED_DIAGRAM — a third-party plugin registered for that keyword can never take over. Should unported first-party types yield to an externally registered plugin?
## Added after #18 (visual baseline)
- Review pass (likely regression): `style <subgraphId>` gives STYLE_UNKNOWN_NODE from render(); v12 supports styling subgraphs by id — verify against the oracle and fix.
- Argos reference branch must be `mermaid-v13` (not develop). Needs ARGOS_TOKEN secret (human). WebKit smoke unverified locally (launch timeout on this Mac). gallery.yml (Pages on alpha tags) never run.
- Review pass: codeql.yml triggers on [develop] and the Argos comment/baseline in ci.yml says develop; v13 work lives on mermaid-v13 (R-REL-1). Point both at mermaid-v13.
## Added after #17/#20
- Review pass: add @braintree/sanitize-url's MIT notice to THIRD_PARTY_NOTICES (core/svg/url.ts ports its logic via the reference implementation) — MIT requires it.
- #20 human setup (report to maintainer, do not do): RELEASE_BOT_TOKEN (+ branch-protection bypass), MERMAID_CHART_PACKAGES_TOKEN, env `npm-alpha` with NPM_TOKEN, repo var PUBLIC_ALPHA, confirm @mermaid-chart/{core,diagram-flowchart,plugin-interactions} names; publish-fork deep install check after first private alpha.
- MermaidError has no `limit` field (callers read cause.limit / diagnostics[0].code) — consider adding in review pass.
## Added after #16 (DOM adapter merged)
- Review pass (R-SVG-3 / DESIGN §7.1 violation): renderer writes unprefixed `id="A"` on nodes → duplicate ids with two diagrams on one page; svg root has no id. DESIGN: the only element ids are `${idPrefix}-title`/`-desc`; everything else uses data-id/data-ast/classes. #14's "no collisions" spec missed it — fix + strengthen that spec.
- WebKit unverified locally for #16/#18 (launch hangs on this Mac); CI must confirm.
- #23: DOM adapter calls result.bindFunctions?.(el) once in run/mount (packages/mermaid/src/dom.ts). Update MIGRATION.md interactions-plugin "(later in M1)" row.
