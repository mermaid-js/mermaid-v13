# Mermaid v13 — Requirements

Status: **Draft for review** · 2026-10-31
Sources: [DECISIONS.md](DECISIONS.md) (D1–D45, P1) · [research/](research/)

## 1. Why v13

Mermaid is both a syntax and a renderer. The syntax is widely adopted. The renderer has become big, slow and hard to secure, and integrators are replacing it. Obsidian, which ships to millions of users, has moved to Pele, a zero-dependency re-implementation of the renderer. Other apps are following.

The measured gap on 158 flowcharts (`mermaid-v13-approches`, 2026-10-30, Chromium, M4 Max):

|  | Mermaid 12.2 (default = ELK) | Mermaid 12.2 (dagre) | Pele (TS) | Ondine (Rust/WASM) |
| --- | --- | --- | --- | --- |
| Fetched for a flowchart (gzip) | 654 KB | 213 KB | 62 KB | 4 KB JS + 135 KB WASM |
| Σ warm median (153 common) | 13.7 s | 8.5 s | 0.14 s | 0.15 s |
| Runtime npm deps | 86 transitive | 86 | 0 | 0 at runtime |
| `foreignObject` / `<style>` in output | yes / yes | yes / yes | no / no | no / no |

Pele and Ondine are tied on speed. Most of the gap comes from architecture, not language: a DOM-free pipeline, no generic sanitizer, measurement with no DOM inserts, and no accidental costs. One example of an accidental cost is the per-call config cloning found in PR #8635.

v13 closes the gap on **size, speed, theming and security** while keeping Mermaid's main asset: **the syntax, and the documents already written in it.**

## 2. Principles

- **P1 – Mermaid is the baseline.** Existing behaviour and defaults stay unless there is a reason to change them. Take from Pele, Ondine and others only where they are demonstrably better. (P1)
- **P2 – Syntax is sacred, pixels are not.** Existing diagram text must keep working. The visual output may change, because this is a major version. (D2)
- **P3 – Pure core.** Core is a pure function from text to output. It uses no DOM and no global mutable state, and its data structures are plain. This keeps it fast, testable, runnable on servers, and keeps a Rust/WASM implementation possible. Possible, not planned: there is no requirement or plan to build one. (D3, D4, D42)
- **P4 – Safe by construction.** Output is generated to be safe. It is not sanitized after the fact. (D6)
- **P5 – Measured, not claimed.** Every target has an automated check in CI. (D10, D43)

## 3. Scope and milestones

| Milestone | Content | Decisions |
| --- | --- | --- |
| **M1** | Core pipeline, flowchart only, built-in layered layout, SVG backend, themes (light/dark + v12 names), parser kit, parity oracle, benchmarks in CI, DOM adapter | D8, D18, D37 |
| **M2** | ASCII/Unicode text output backend for flowcharts: text-grid kit in core, unit profile, API and CLI | D11, D24, D57, D58, D76–D87 |
| **M2.5** | `@mermaid-js/language-service` + CodeMirror/Monaco adapters + LSP server (flowchart first) | D37, D88–D99 |
| **M3** | sequence, class, state, ER | D34, D100–D105, D107–D133 |
| **M3.5** | Plugin platform: lazy-loaded first-party packages, plugin auto-discovery and CDN loading, ELK plugin, optional-feature packages, `neo` themes, core size budget | D106, D160–D169 |
| **M4** | gantt, pie, mindmap, timeline, gitGraph, journey, quadrant | D34 |
| **M5** | Remaining v12 diagram types | D34 |
| **Parallel** | Small v12 performance track | D44 |

**Out of scope for v13:**

- Rust/WASM implementation: not required and not planned. v13 only keeps it possible (P3, R-ARCH-7).
- HTML labels and `foreignObject`.
- JS click callbacks in core (they ship as a first-party plugin, R-PLUG-9).
- A bridge that delegates to v12 renderers.
- Zoom/pan in core.
- Pixel parity with v12.

**Glossary:**

- **Core:** the `packages/core` pipeline.
- **Diagram package:** one diagram type, such as `@mermaid-js/diagram-flowchart`.
- **Oracle:** `mermaid@12`, used in tests to decide what counts as correct syntax.
- **Corpus:** the test diagrams (§21).
- **Integrator:** an app embedding Mermaid.
- **Author:** a person writing diagram text.
- **Cell:** one character position in text output; the unit of ASCII layout (one column wide, one row high; wide characters take two).
- **Unit profile (`UnitProfile`):** the injected table of every length constant layout uses (paddings, spacing, label patch, head room, track pitches, turn threshold). `px` for SVG, `cell` for ASCII. Layout depends on the measurer and the unit profile, never on a backend (R-ARCH-3).
- **Grid quantum:** `LayoutGraph.grid`; when set, the engine places boxes, ports and tracks on whole multiples of it (1 for ASCII).
- **Text-grid kit:** `@mermaid-js/core/ascii`: the character canvas, glyph sets, junction merging, cell measurer and repair router that diagram `ascii` hooks draw with.
- **Glyph set:** the characters one charset uses for lines, corners, junctions and arrowheads (`unicode` or `ascii`).
- **Repair router:** the cell-space A\* that re-routes only edge segments that collide after snapping.
- **Upstream golden:** a mermaid-ascii fixture's expected output, kept beside v13's own golden and checked structurally only.
- **Language service:** `@mermaid-js/language-service`, the pure, editor-agnostic engine behind the editor adapters and the LSP server (§20).
- **Language facet:** what a diagram package exports from its `./language` subpath so the language service can support that type: parser entry, token kind → category table, completion table, hover docs and symbol namespace rules (R-LANG-8).
- **Probe:** a parse run with `probe: offset`, which records the token kinds the parser would accept at that offset, the lexer mode and the typed prefix; it drives completion (R-LANG-7).

## 4. How to read the requirements

Each requirement has:

- an ID: `R-<AREA>-<n>`;
- a priority: **Must**, **Should** or **Could**;
- the milestone in which it must first hold;
- its source decision(s);
- an **acceptance** check.

A requirement that holds at milestone *n* keeps holding afterwards. Diagram-specific requirements apply to each diagram type when it is ported.

---

## 5. Compatibility (R-COMPAT)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-COMPAT-1 | v13 is published as the next major of the `mermaid` npm package. | Must | M1 | D1 | `packages/mermaid/package.json` version `13.x` |
| R-COMPAT-2 | For each supported diagram type, every source the oracle accepts is accepted, and every source it rejects is rejected, except entries in the committed divergence list. | Must | M1 | D2, D15 | Oracle accept/reject suite green over the full corpus |
| R-COMPAT-3 | For each supported diagram type, the parsed model is equivalent to the oracle's DB state after normalisation, except listed divergences. | Must | M1 | D15 | DB-parity suite, in the style of `flow.db-parity.spec.ts`, green |
| R-COMPAT-4 | Every divergence from the oracle is listed with a reason and an owner. An unlisted divergence fails CI. | Must | M1 | D15 | `divergences.json` is checked by the oracle suite |
| R-COMPAT-5 | `render()`, `parse()`, `initialize()` and `run()` keep their v12 call signatures. | Must | M1 | D2 | Type-level test against the v12 `.d.ts` signatures |
| R-COMPAT-6 | Front matter, `%%{init}%%` directives, `accTitle`/`accDescr` and `%%` comments behave as in v12. | Must | M1 | D2, P1 | Oracle suite plus dedicated specs |
| R-COMPAT-7 | A diagram type that v13 does not yet support gives a typed `UnsupportedDiagramError`. It never renders something else or nothing. | Must | M1 | D9 | Spec: `gantt` source on M1 build gives `code: 'UNSUPPORTED_DIAGRAM'` |
| R-COMPAT-8 | Syntax added to v12 after v13 starts reaches v13 through the oracle. A scheduled job bumps the `mermaid@12` dev dependency, and new failures become tickets. No v12 code is merged into v13. | Must | M1 | D16 | Scheduled CI job exists and opens issues |
| R-COMPAT-9 | A migration guide lists every removed feature, changed default and config key, each with its replacement. | Must | M1 | D2, D22 | `v13/docs/MIGRATION.md` reviewed before the first public alpha |
| R-COMPAT-10 | Drop-in upgrade: a user who bumps mermaid to v13 without reading anything keeps working with unchanged installation and setup code (npm import, CDN script tag, initialize/run). Which features they get by default is decided in step two. Deferred: not required for the draft implementation. | Must | Release (step two) | D63 | v12 example apps (npm, CDN) render with only the version changed |

## 6. Architecture and runtime (R-ARCH)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-ARCH-1 | Core renders `(text, options) → { svg: string, warnings, … }` with no DOM, `window` or `document` access. | Must | M1 | D4 | Core test suite runs in Node with no DOM shim; a lint rule bans DOM globals in `packages/core` and `packages/diagram-*` |
| R-ARCH-2 | The pipeline has explicit stages with plain-data boundaries: preprocess, detect, parse → model, layout → layout model, render → SVG node tree, serialise. | Must | M1 | D3, D11 | DESIGN.md defines each stage's type; each stage is unit-testable in isolation |
| R-ARCH-3 | The layout model is independent of the renderer: layout depends only on an injected measurer and an injected unit profile, never on a backend. Every length constant in a diagram's graph builder and in the layout engine comes from the unit profile (`px` or `cell`). Every backend (SVG, ASCII) consumes the same LayoutModel type and never measures itself; ASCII gets its sizes by running layout with the cell measurer and the cell profile. | Must | M1 | D11, D24, D57, D77 | ASCII backend (M2) uses no SVG-specific data. Checked at M2: a lint/spec finds no length literal in the flowchart graph builder or the layered engine outside the px profile; SVG output is byte-identical before and after the profile is introduced |
| R-ARCH-4 | There is no module-level mutable state in core or diagram packages. Two renders with different configs can run concurrently and interleaved without affecting each other. | Must | M1 | D22, D42 | Concurrency spec: interleaved renders with different themes produce byte-identical output to sequential renders |
| R-ARCH-5 | Config is resolved once per render into a frozen object and passed explicitly to every stage. Core and diagram packages have no global config lookup. | Must | M1 | D42 | Lint rule; mutating the resolved config throws in tests |
| R-ARCH-6 | Output is byte-identical for the same input, options and measurer. | Must | M1 | D23 | Property test: render twice and compare, over the corpus |
| R-ARCH-7 | No Rust/WASM implementation is required or planned, but core must not block one: insertion-ordered collections, explicit tie-breaks, no reliance on object key order of numeric keys, the current time is passed in rather than read, and errors are values. | Should | M1 | D3, D46 | DESIGN.md checklist; code review |
| R-ARCH-8 | Runtime targets are ES2022, evergreen browsers from the last \~2 years, Node ≥ 20, web workers and Deno. There are no polyfills. | Must | M1 | D27 | CI smoke render in Node 20, Deno, a worker, and Chromium, Firefox and WebKit |
| R-ARCH-9 | v12 sources are removed from the `mermaid-v13` branch. v12 exists there only as the npm oracle. | Must | M1 | D25 | No `packages/mermaid/src/diagrams/**` from v12 on the branch |

## 7. Performance and size (R-PERF)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-PERF-1 | Core + flowchart, as loaded for a flowchart render, is ≤ 120 KB gzip (D160; was 80 KB). | Must | M1 | D10, D160 | Bench "Loaded" size, measured after one flowchart render |
| R-PERF-2 | Core and every first-party diagram package have **zero** runtime npm dependencies. | Must | M1 | D10 | CI check on `dependencies` of published packages |
| R-PERF-3 | Warm render is ≥ 50× faster than frozen `mermaid@12.2.0` with dagre, as a geomean over the corpus. | Must | M1 | D10, D45, D150 | Approaches harness geomean, reported in CI and enforced on a local run (D150); current v12 also reported |
| R-PERF-4 | 100% of the flowchart corpus renders without error, including the large and huge tiers. | Must | M1 | D10 | Harness OK count = corpus size |
| R-PERF-5 | Benchmarks report time per stage: parse, measure, layout and serialise. | Must | M1 | D43 | Harness output contains stage columns |
| R-PERF-6 | The fixed benchmark fixtures include the Pele/#8635 set (7-, 50- and 500-node flowcharts, sequence, class) plus the 158-diagram corpus. | Must | M1 | D43 | Fixtures committed |
| R-PERF-7 | CI fails when any stage regresses by more than 10% on the reference runner. | Must | M1 | D43 | CI job with a stored baseline |
| R-PERF-8 | Core has a published size budget, enforced in CI: everything the `mermaid` entry loads before any diagram chunk (`@mermaid-js/core` plus the public API, registry, detectors and DOM adapter) is ≤ 88 KB gzip. Later diagram packages are optional plugins and have no size budget for now. | Should | M3.5 | D7, D59, D161 | Committed budget file; esbuild size spec in `pnpm check` |
| R-PERF-9 | The time from loading the module to the first possible render is ≤ 15 ms on the reference runner (Pele: 10 ms). | Should | M1 | – | Harness "Ready at" |

## 8. Parsing (R-PARSE)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-PARSE-1 | Parsers are hand-written lexers and recursive-descent parsers. Parser generators and parser runtimes (jison, Langium, Chevrotain, ANTLR) are not shipped, but may be used as test oracles. | Must | M1 | D14 | Dependency check (R-PERF-2); no generator in the build |
| R-PARSE-2 | A shared **parser kit** in core provides tokenising helpers, source-position mapping (including front matter and directive offsets), the diagnostic type and recovery helpers. | Must | M1 | D14 | Kit used by the flowchart parser; unit tests |
| R-PARSE-3 | Every parse returns, besides the model: token spans, identifier occurrences (definitions and references), statement spans, and a list of diagnostics with ranges. | Must | M1 | D14, D37 | Spec on the flowchart corpus |
| R-PARSE-4 | Parsers recover at statement boundaries. A document with N independent errors yields N diagnostics. | Must | M1 | D14 | Recovery test set (≥ 20 cases) |
| R-PARSE-5 | Go-to-definition, find-references and fold ranges computed from parse output are correct on the corpus. | Must | M1 | D14 | Tooling spec with expectations generated from the oracle model |
| R-PARSE-7 | Parse time is linear in input size. There are no backtracking regexes on user input. | Must | M1 | D6 | Fuzz and stress test with pathological input under a time bound; regex lint |
| R-PARSE-8 | Parse output includes a typed, documented AST usable by editors. Every AST node has a stable id and a source span. Every rendered element that comes from an AST node carries that id (an allow-listed data attribute). An editor can then go both ways: from a diagram element to its source range, and from a cursor position to the diagram elements. | Must | M1 | D53 | Round-trip spec over the corpus: every node, edge and subgraph maps source ↔ SVG element; AST types published in the API docs |
| R-PARSE-9 | Each diagram type has a concise grammar file (EBNF with lexer modes) that is the normative definition of its syntax. The hand-written parser must conform to it. A parser generated from the grammar is used only in dev and CI, as a differential oracle and to generate fuzz sentences. The grammar also generates the syntax highlighters (TextMate, Monarch, Lezer) and the syntax reference docs. | Must | M1 | D54 | Flowchart grammar committed; CI differential test (grammar parser vs hand-written) green over corpus + generated sentences; highlighters built from it |

## 9. Text, labels and fonts (R-TEXT)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-TEXT-1 | Labels are SVG `<text>`/`<tspan>` only. There is no `foreignObject` and no HTML label mode. | Must | M1 | D5 | Output allow-list test (R-SEC-2) |
| R-TEXT-2 | The markdown string subset (bold, italic, line breaks, inline code) supported in v12 labels is rendered to tspans. | Must | M1 | D5, P1 | Specs plus visual baseline |
| R-TEXT-3 | HTML in labels is never interpreted. A documented subset (`<br>`, `<b>`, `<i>`, `<strong>`, `<em>`) is converted to text formatting, and everything else is shown as literal text. | Must | M1 | D5, D6 | Specs; XSS corpus |
| R-TEXT-4 | Text measurement is a pluggable `Measurer` interface. | Must | M1 | D17 | Interface in core; custom measurer spec |
| R-TEXT-5 | The browser default measurer uses canvas `measureText` with the resolved font. Its cache is invalidated when web fonts finish loading. | Must | M1 | D17 | Browser test with a late-loading web font |
| R-TEXT-6 | The Node/worker default measurer uses bundled width tables for the default font stack. | Must | M1 | D17 | Node render produces sensible label boxes (no overflow on the corpus at default font) |
| R-TEXT-7 | `deterministic: true` forces the table measurer in every environment. Browser and Node output are then byte-identical. | Must | M1 | D17 | Cross-environment equality test |
| R-TEXT-8 | Wrapping honours `wrappingWidth`, is CJK-aware, and handles soft hyphen and zero-width space. Emoji and wide characters are measured as wide. | Must | M1 | D17, P1 | Specs |
| R-TEXT-9 | The font family comes from `fontFamily` config / `--mermaid-fontFamily`, with v12's default as the fallback (P1). | Must | M1 | D17, D20 | Spec |
| R-TEXT-10 | Math (KaTeX) and icons are provided by optional plugins that emit SVG paths, never HTML. | Should | M4 | D5, D7 | Plugin exists; allow-list test passes with plugin enabled |
| R-TEXT-11 | Markdown strings also accept bullet lists (lines starting with "- " or "\* ", one nesting level). They render as indented tspan lines with a bullet glyph. Bullets are recognised only inside markdown strings, never in plain labels, so existing diagrams are not broken. | Should | M1 | D56 | Specs plus visual baseline; oracle corpus shows no change for labels without markdown bullets |

## 10. Layout (R-LAYOUT)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-LAYOUT-1 | Core ships a zero-dependency layered (Sugiyama-style) layout, derived from Pele's: longest-path ranking, barycenter crossing reduction, Brandes-Köpf placement, straightening, and compound subgraphs with border ports. | Must | M1 | D18, D12 | Flowchart corpus renders; DDLT-style layout tests |
| R-LAYOUT-2 | Layout engines implement a plain-data interface `(graph, measurer, config) → LayoutModel`. Alternative engines (DOMUS, ELK plugin, tidy-tree) plug in via `registerLayoutLoaders`. | Must | M1 | D18, D32 | Second engine (test stub) registered and selected via `layout:` config |
| R-LAYOUT-3 | Layout is deterministic (R-ARCH-6). There are no NaN or Infinity coordinates. | Must | M1 | D26 | Property tests |
| R-LAYOUT-4 | Flowchart features supported: all directions (TB/TD/BT/LR/RL), subgraphs with their own `direction`, every v12 node shape and edge type, edge labels, `linkStyle`, `curve` interpolations, and minimum edge length (`---->`). | Must | M1 | P1, D2 | Visual baseline per feature |
| R-LAYOUT-5 | Optional `availableWidth` makes the layout adapt to the width: tighten spacing first, then switch LR to TB under a threshold. It is off by default. | Should | M1 | D19 | Specs at several widths |
| R-LAYOUT-6 | Layout honours `nodeSpacing`, `rankSpacing`, `padding` and `diagramPadding` with v12 default values. | Must | M1 | D22, P1 | Specs |
| R-LAYOUT-7 | ELK is available only as an optional plugin package. It is never the default and never part of core. | Must | M3.5 | D7 | Package exists; core size unaffected |

## 11. SVG output (R-SVG)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-SVG-1 | Renderers build an SVG node tree. Serialisation (with escaping) happens only in core's SVG writer, and diagram code never concatenates markup strings. | Must | M1 | D35, D6 | Lint/review rule; writer escaping tests |
| R-SVG-2 | Every node, edge and cluster carries `data-id` (its id in the source) and semantic classes (e.g. `node`, `edge`, `cluster`, plus user classes). | Must | M1 | D23 | Spec |
| R-SVG-3 | Element ids are prefixed per render, so multiple diagrams on one page never collide. | Must | M1 | D23 | Spec with two renders in one document |
| R-SVG-4 | `click X href "url"` produces a static `<a>` whose scheme is checked (R-SEC-4). The v12 link target (\_self, \_blank, \_parent, \_top) is kept as the target attribute, and \_blank also gets rel="noopener noreferrer". Tooltips become SVG `<title>`. | Must | M1 | D23, D62 | Specs |
| R-SVG-5 | `click X callback` / `call` are parsed into the model. Without the interactions plugin (R-PLUG-9) they are ignored with a warning. | Must | M1 | D23, D47 | Spec |
| R-SVG-6 | The default output contains no `<style>` element. | Should | M1 | D20 | Allow-list test |
| R-SVG-7 | The root `<svg>` has a `viewBox`, and `useMaxWidth` behaves as in v12. | Must | M1 | P1 | Spec |

## 12. Theming (R-THEME)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-THEME-1 | `theme` and `themeVariables` remain the theming API, with v12 variable names. | Must | M1 | D20, P1 | Spec over all v12 base variables |
| R-THEME-2 | Every theme variable a diagram uses is exposed as a CSS custom property with the same name (`--mermaid-<variableName>`). Output references it as `var(--mermaid-x, <computed fallback>)`. | Must | M1 | D20 | Spec; standalone SVG renders correctly with no CSS |
| R-THEME-3 | A host page can re-theme rendered diagrams by setting CSS variables, without re-rendering. | Must | M1 | D20 | Browser test: change the variable and diagram colours change |
| R-THEME-4 | Derived colours (borders, hover, secondary and tertiary fills, contrast text) are computed in CSS with `color-mix()`/`var()` from the base variables, with a computed fallback. Overriding a base variable updates its derived colours. | Must | M1 | D39 | Browser test overriding `--mermaid-primaryColor` |
| R-THEME-5 | A theme can be fully specified with a small set of base variables (target ≤ 8: primary, secondary, tertiary, background, text, line, font family, font size). | Must | M1 | D20 | Doc + spec: base-only theme renders fully |
| R-THEME-6 | Built-in themes `redux-color` (the default when no theme is set), `redux`, `redux-dark`, `redux-dark-color`, `default`, `dark`, `forest`, `neutral` and `base` are supported, with recognisably the same palettes as v12. | Must | M1 | D20, D55, D151, P1 | Visual baseline |
| R-THEME-7 | The remaining v12 themes (`neo`, `neo-dark`) are supported as well, either in core or as theme packages. Until then they render `redux-color` and `redux-dark-color` with a warning. | Must | M3.5 | P1, D64, D151 | See open item O-2 |
| R-THEME-8 | Optional `theme: 'auto'` follows the OS light/dark setting via a variables-only `<style>` with `prefers-color-scheme`. | Could | M1 | D20 | Browser test with emulated colour scheme |
| R-THEME-9 | Built-in themes meet WCAG AA contrast for text on fills, in both light and dark. | Must | M1 | D29 | Automated contrast check over theme tokens |
| R-THEME-10 | Colour handling has no runtime dependency (no khroma). | Must | M1 | D10, D39 | R-PERF-2 |
| R-THEME-11 | Every diagram type supports the redux themes. All diagram types rendered together in a redux theme look like one family: a shared palette, stroke widths, corner radii, typography, spacing, arrowhead geometry, shape padding and drop shadow come from common theme tokens, not from per-diagram choices or theme-name checks. | Must | M1 | D55, D152 | Redux visual baseline per type; gallery page of all types in redux reviewed for cohesion at each port |
| R-THEME-12 | Text on fills chosen by the author gets automatically contrasting ink. | Should | M1 | D21 | Spec |

## 13. Configuration (R-CONF)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-CONF-1 | The v12 config schema is kept. Only keys for features v13 removed are deleted: `htmlLabels`, click-callback keys (moved to the interactions plugin, R-PLUG-9) and other keys listed in MIGRATION.md. | Must | M1 | D22, D47, D48 | Schema diff reviewed; MIGRATION.md lists each removal |
| R-CONF-2 | Unknown or removed keys produce a warning in `RenderResult.warnings` and never an error. | Must | M1 | D2, D30 | Spec |
| R-CONF-3 | Config sources merge as in v12, per render: defaults → `initialize()` → front matter → directives. The secure-keys rule is kept, so a diagram cannot change integrator-only keys. | Must | M1 | D22, P1 | Specs mirroring v12 config specs |
| R-CONF-4 | A generated document lists every config key and is generated from the config JSON schema. The schema is the single source of truth: each key carries its type, default, description and compatibility data (honoured in v13 or not, since which version, removed or moved, and the replacement). | Must | M1 | D22, D60 | Doc generated from the JSON schema; CI fails if it is stale or a key lacks compatibility data |
| R-CONF-5 | A config key of a diagram type that isn't ported yet is accepted silently. It starts being honoured when that type lands. | Must | M1 | D22 | Spec |

## 14. Security (R-SEC)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-SEC-1 | Generated SVG is safe by construction, so no HTML sanitizer (DOMPurify or other) is needed, either in v13 or by integrators displaying its output. | Must | M1 | D6, D61 | No sanitizer dependency; unsanitised output passes the R-SEC-2 allow-list test and the XSS corpus |
| R-SEC-2 | Output passes a per-diagram **element and attribute allow-list**: no `<script>`, `foreignObject`, `on*` attributes, `javascript:`/`data:` URLs (except allow-listed image types), or `<style>` (except R-THEME-8). | Must | M1 | D6, D26 | Allow-list property test over the corpus + XSS corpus (v12's GHSA/XSS pages ported) |
| R-SEC-3 | `style`, `classDef` and `linkStyle` values pass a per-property allow-list (fill, stroke, stroke-width, stroke-dasharray, color, opacity, font-weight, font-style, font-size, …). They are emitted as presentation attributes, and the rest is dropped with a warning. | Must | M1 | D21 | Specs, including CSS-injection cases |
| R-SEC-4 | Link URLs are checked against a scheme allow-list (http, https, mailto, relative) at the default security level. With securityLevel strict, only relative links are allowed. | Must | M1 | D6, D48 | Spec |
| R-SEC-5 | Default limits are 50,000 source characters, 5,000 edges, plus a node cap, a nesting-depth cap and an output-size cap. Only the integrator can change them, never the diagram. | Must | M1 | D31 | Specs incl. attempt to raise via front matter |
| R-SEC-6 | `securityLevel` is kept with two levels: the default applies the R-SEC-4 scheme allow-list, and strict allows only relative links. Sandbox/iframe mode is removed; other v12 values (loose, antiscript, sandbox) are treated as the default, with a warning. | Must | M1 | D48 | MIGRATION.md; config warning |
| R-SEC-7 | Parsers and the SVG writer are fuzzed in CI, with no crashes, hangs or allow-list violations. | Must | M1 | D15, D26 | Fuzz job |

## 15. Errors and diagnostics (R-ERR)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-ERR-1 | Failures reject or throw a typed `MermaidError { code, message, line, column, offset, length, expected? }`, with positions pointing into the original source. | Must | M1 | D30 | Specs |
| R-ERR-2 | Diagnostic messages include a snippet with a caret, at most 5 grouped expectations, and, for unclosed constructs (`[`, `subgraph`, `"`), the position of the opener. | Must | M1 | D38 | Snapshot tests over the error set |
| R-ERR-3 | Error behaviour matches v12. A diagram that fails is replaced by an error image, and run() continues rendering the remaining diagrams in the same call. suppressErrorRendering turns the error image off, and render() still rejects with a MermaidError (R-ERR-1). | Must | M1 | D30, D49 | Browser test: a broken diagram between two valid ones shows the error image, and both valid diagrams render |
| R-ERR-4 | Warnings are returned in `RenderResult.warnings`. Nothing is written to the console. | Must | M1 | D30 | Lint ban on `console` in core and diagram packages |
| R-ERR-5 | Error messages are human-readable. They name the construct in Mermaid terms ("unclosed node label started at line 3"), never internal token or rule names, and say what would fix it where that is clear. They must be clearly better than v12's messages. | Must | M1 | D50 | Error set snapshots shown side by side with v12's messages and reviewed; test fails if a message contains a token or rule name |

## 16. Public API (R-API)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-API-1 | `render`, `parse`, `initialize` and `run` are kept (R-COMPAT-5). | Must | M1 | D2 | – |
| R-API-2 | `renderSync(text, options)` is added, with rendering split into two phases. prepare(text) is async: it detects the type, parses, finds every resource the diagram needs (diagram package, icon packs, math, layout engine) and loads them. renderSync is sync and pure, and uses only what is already loaded. render() is prepare + renderSync. If something is missing, renderSync throws a typed NotLoadedError listing the missing resources. An option renders placeholders (e.g. an empty icon box) with a warning instead. preload({ types, iconPacks, … }) lets hosts that cannot await at render time (markdown-it, SSR) load everything up front. | Must | M1 | D32, D51 | Specs: renderSync after prepare equals render() output; icon diagram without its pack throws NotLoadedError naming it; placeholder option renders with a warning |
| R-API-3 | `registerExternalDiagrams`, `registerLayoutLoaders` and `detectType` are kept. `registerIconPacks` is kept, and is a no-op with a warning until the icons plugin exists. | Must | M1 | D32 | Specs |
| R-API-4 | `setParseErrorHandler` is kept but deprecated, and receives `MermaidError`. | Should | M1 | D32 | Spec |
| R-API-5 | The `mermaidAPI` object is removed. | Must | M1 | D32 | MIGRATION.md |
| R-API-6 | `run()` finds `pre.mermaid`/`.mermaid` elements and replaces them as in v12. | Must | M1 | D33, P1 | Browser test |
| R-API-7 | `mount(el, text, options)` re-renders on resize only when `availableWidth` is used, re-measures after fonts load, and needs no re-render on theme change. | Should | M1 | D33 | Browser test |

## 17. Packaging and plugins (R-PLUG)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-PLUG-1 | The monorepo contains `packages/core`, one `packages/diagram-<type>` per diagram type, and `packages/mermaid` (public API plus bundle). Each diagram package is versioned independently. | Must | M1 | D7, D25 | Workspace layout |
| R-PLUG-2 | There are two kinds of plugin, both pure (data in, data out). Diagram plugins implement `{ id, detector, parse, layout?, render → SvgNode tree, ascii? }`. Extension plugins register hooks that apply to any diagram type: postParse(ast) → ast, postLayout(layoutModel) → layoutModel, and postRender(svgTree) → svgTree, which runs before serialisation. The DOM adapter adds afterMount(element) for runtime behaviour such as R-PLUG-9. Hooks run in registration order, and their output still passes the R-SEC-2 allow-list. Config, measurer, theme tokens and limits are passed in as arguments. | Must | M1 | D35, D42, D52 | flowchart implemented purely through the contract; a fixture extension plugin exercises every hook |
| R-PLUG-3 | A plugin declares itself in `package.json` under `"mermaid": { plugin, id, detector, entry }`. The detector is tiny and loaded eagerly; the entry is loaded lazily on detection. The manifest also has a kind: diagram or extension. Extension plugins (R-PLUG-2) have no detector. Their entry registers hooks and is loaded when the plugin is activated. | Must | M1 | D40, D52 | Spec with a fixture plugin |
| R-PLUG-4 | Installing `mermaid` gives every first-party diagram type with no configuration. The packages are dependencies that are lazily imported, and bundlers code-split them so only the types actually rendered are downloaded. | Must | M3.5 | D40 | Bundle test: page with one flowchart downloads only core + flowchart |
| R-PLUG-5 | Third-party and heavy plugins activate on install: in Node/SSR by auto-discovering manifests in `node_modules`; in bundlers through a one-line `@mermaid-js/bundler-plugin` (unplugin for Vite, webpack, Rollup and esbuild); on a CDN by adding a self-registering script. | Must | M3.5 | D35, D40, D164–D167 | Example apps for each path in CI |
| R-PLUG-6 | `registerExternalDiagrams()` always works as an explicit fallback. | Must | M1 | D40 | Spec |
| R-PLUG-7 | The CDN build lazy-loads first-party diagram packages only from the configured CDN base, never from a URL in diagram text. | Must | M3.5 | D41, D162, D163 | Spec |
| R-PLUG-8 | Optional features (ELK, math, icons, hand-drawn look) are separate plugin packages. Core size is unaffected by their existence. | Must | M3.5 | D7 | Size check |
| R-PLUG-9 | A first-party interactions plugin restores v12 click callbacks (click X callback, call) from day one. Core only emits stable node ids; the plugin binds handlers to the rendered DOM after render, so core output stays inside the allow-list (R-SEC-2). The integrator opts in by installing it; diagram text alone cannot enable it. | Must | M1 | D47 | Spec: callback fires with plugin, warning without it; allow-list test passes with plugin enabled |

## 18. ASCII output (R-ASCII)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-ASCII-1 | An ASCII/Unicode text backend renders flowcharts from the shared layout model. Layout runs with the cell measurer and the cell unit profile, `stepped` routing and an integer grid quantum; routes are snapped to cells and only colliding segments are re-routed by the repair router. Every edge end has its own cell on a box side; a side with too many ends grows the box, and ends are never bundled. The flowchart draws through its `ascii` hook with the `core/ascii` text-grid kit. | Must | M2 | D11, D24, D76, D77, D78, D140 | Golden-file tests; no two edge ends share a cell or a box corner (corpus property); every direction, edge type, subgraph case and shape in the corpus renders |
| R-ASCII-2 | mermaid-ascii's 142 flowchart golden files are ported as fixtures. v13's own `expected.txt` goldens compare exactly; the upstream output is checked structurally only. Inputs Mermaid rejects or reads differently, and structural failures, are listed in `ascii-divergences.json` with a reason; an unlisted failure or a stale entry fails CI. | Must | M2 | D24, D83 | Ported fixtures and divergence list in CI |
| R-ASCII-3 | Diagram types may provide a native cell layout (e.g. sequence, ER) through the `ascii` hook. | Could | M3 | D24, D35 | Contract supports it |
| R-ASCII-4 | ASCII output is available via API (`render(id, text, { format: 'ascii' })`, `renderSync(text, { format: 'ascii' })`, returning `TextRenderResult { format, text, columns, rows, diagramType, warnings }`) and the zero-dependency `mermaid` CLI bin (`mermaid render [file\|-] --format ascii\|svg [--charset ascii] [--width N\|auto]`). Text uses `\n`, has no trailing spaces and is byte-deterministic. The CLI writes diagnostics to stderr and exits 1 on an error, 2 on an unsupported format. | Must | M2 | D11, D80, D85 | Specs; CLI specs over stdin and files |
| R-ASCII-5 | ASCII support is opt-in per diagram type. A type supports it through the ascii hook, or by being graph-based on the shared layout, and declares it in its manifest. supportsFormat(type, 'ascii') lets hosts check up front. Requesting ASCII for an unsupported type throws a typed UnsupportedFormatError and never produces an approximation. Within a supported type, features with no text form (colours, styles, images, icons, curves, links, bold/italic) are dropped with one `ASCII_DROPPED` warning per feature kind; shapes without their own text form are drawn as boxes with one `ASCII_SHAPE` warning. The docs carry a type × format support matrix. | Must | M2 | D58, D82 | Specs: unsupported type throws UnsupportedFormatError; supportsFormat matches manifests; dropped features produce warnings; matrix generated from manifests |
| R-ASCII-6 | Two glyph sets: `unicode` box drawing (default) and pure `ascii`, chosen by `ascii.charset` (diagram text may set it). Solid, dotted and thick edges, every arrowhead kind, tees and all junctions (heavy and dashed included) have a glyph in both sets. | Must | M2 | D79 | Glyph-table specs; goldens in both sets |
| R-ASCII-7 | The cell measurer counts grapheme clusters: East Asian Wide/Fullwidth and emoji take 2 cells, combining marks and ZWJ 0, for node, edge and subgraph labels alike. Each label line is one row; wrapping honours `wrappingWidth` converted to cells. | Must | M2 | D81 | Specs with CJK, emoji, ZWJ sequences, flags and combining marks |
| R-ASCII-8 | `ascii.maxWidth` (columns) drives `availableWidth` in cells. Output is never cropped; an `ASCII_TOO_WIDE` warning is added when it still doesn't fit. | Should | M2 | D84 | Specs at several widths |
| R-ASCII-9 | Each diagram type's text path (the `core/ascii` kit plus that type's ascii entry) stays within 15 KB gzip and is never loaded for an SVG render (D130). ASCII render properties run over the whole in-repo corpus of each type with text output, in both charsets, in PR CI (no throw where SVG renders, deterministic, labels present, no overlapping boxes, row widths match `columns`, no trailing spaces). | Must | M2 | D87, D130 | Size check per type (gate on the largest); bundle test (SVG page loads no ascii chunk); property suite |

## 19. Accessibility (R-A11Y)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-A11Y-1 | `accTitle`/`accDescr` produce `<title>`/`<desc>`. The root has `role="img"` and `aria-labelledby`/`aria-describedby`. | Must | M1 | D29 | Spec |
| R-A11Y-2 | Labels are real text that screen readers can reach. | Must | M1 | D29 | Covered by R-TEXT-1 |
| R-A11Y-3 | Theme contrast meets WCAG AA (R-THEME-9). | Must | M1 | D29 | – |

## 20. Language tooling (R-LANG)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-LANG-1 | `@mermaid-js/language-service` is pure, editor-agnostic and has zero runtime dependencies. Built only on the parser kit outputs, it provides diagnostics (passed through from preprocess and parse), definition, references and validated rename (per-diagram symbol namespaces), hover, folding, semantic tokens (categories generated from the grammar file) and completion (keywords, node/subgraph ids, class names, directions, shapes, link targets, arrows). A type with no language facet gets an info diagnostic and generic features only. | Must | M2.5 | D37, D88, D90–D95 | Golden specs per feature on flowchart; R-PARSE-5 expectations re-run through the service; CI test that semantic tokens and the TextMate/Monarch/Lezer grammars agree per token over the corpus |
| R-LANG-2 | CodeMirror 6 and Monaco adapters set up the whole language in one call (highlighter from the grammar file plus every service feature). A thin LSP server (`mermaid-language-server`, stdio) offers every service feature for `.mmd`/`.mermaid` files. | Should | M2.5 | D37, D88, D98 | Playwright runs CodeMirror and Monaco example editors with a live preview in CI; a scripted LSP client runs against the server |
| R-LANG-3 | Every diagram type ported after M2.5 ships language-service support: a language facet (R-LANG-8) that passes the shared golden suite. | Must | M3+ | D37, D89 | Port checklist |
| R-LANG-4 | `update` plus all queries take ≤ 15 ms for a 50,000-character document on the reference runner, with a full re-parse per change. No query throws at any offset. | Must | M2.5 | D90, D99, D156 | Corpus property test (every query at every token boundary) and a bench fixture |
| R-LANG-5 | Front-matter config gets completion, hover and unknown-key warnings against the config JSON schema, scoped to the detected diagram type. `%%{init}%%` directives get diagnostics only. | Should | M2.5 | D96 | Golden specs; YAML reader returns key/value ranges and recovers after an error |
| R-LANG-6 | `astAt(offset)` and `rangeOf(astId)` map between source positions and AST ids, so a host can highlight `[data-ast]` elements from the cursor and jump from an element to its source. | Must | M2.5 | D97 | Spec over the corpus; example editor syncs cursor and preview |
| R-LANG-7 | The parser kit has a probe mode: `parse(text, { probe: offset })` returns the token kinds acceptable at the offset, the lexer mode and the typed prefix, with normal recovery for the rest of the document and zero cost when unset. | Must | M2.5 | D95 | Kit specs with the tiny test grammar; flowchart probe specs; bench shows no cost without a probe |
| R-LANG-8 | Each diagram package exports a language facet from `./language` (parser entry with no renderer imports, kind → category table, completion table, hover docs, symbol namespaces), listed in its manifest and found through a generated first-party table. | Must | M2.5 | D89 | Flowchart facet; import-boundary lint shows no renderer import from `./language` |

## 21. Testing and quality (R-TEST)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-TEST-1 | A parity oracle runs v13 against `mermaid@12` over the external 10,000+ diagram set, following the Chevrotain branch pattern (`PARSE_FIXTURE_PATH` corpus run + DB-snapshot parity). | Must | M1 | D15, D65 | Oracle job run by QA (not in CI); corpus location documented |
| R-TEST-2 | In-repo corpora include e2e `.mmd` fixtures, docs examples and the 158-diagram benchmark corpus. | Must | M1 | D15, D26 | Runs in PR CI |
| R-TEST-3 | v12 unit specs are ported for each ported diagram type. | Must | M1 | D15 | Ported spec count reported |
| R-TEST-4 | Property tests run over the whole corpus: well-formed SVG, the allow-list, determinism, and no NaN or Infinity. | Must | M1 | D26 | Vitest suite |
| R-TEST-5 | A Playwright/Argos visual baseline covers a curated subset per diagram type. It is the new v13 baseline. | Must | M1 | D26 | CI job |
| R-TEST-6 | A gallery page shows examples of every supported diagram type in every built-in theme. | Must | M1 | D26 | Page published per alpha |
| R-TEST-7 | The `mermaid-v13-approaches` harness (or its successor) runs in CI and enforces R-PERF-1…7. | Must | M1 | D10, D26 | CI job |
| R-TEST-8 | Fuzzing runs per R-SEC-7. | Must | M1 | D15 | – |

## 22. Release and process (R-REL)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-REL-1 | Development happens on branch `mermaid-v13`. v12 continues on `develop`. | Must | M1 | D1 | Branch exists |
| R-REL-2 | Changesets pre-release mode versions the alphas. The release master publishes them (D155); publishing on every merge to `mermaid-v13` waits for CI in the OSS repository. | Must | M1 | D28, D155 | Release workflows, v13/docs/RELEASING.md |
| R-REL-3 | Public `mermaid@13.0.0-alpha.N` (dist-tag `v13-alpha`) is published to npm from the first alpha (D155). Each release prints R-PERF-1…4 on the last bench report. The gate is enforced once R-PERF-3 holds on CI; until then the release master skips it with a stated reason. | Must | M1 | D28, D155 | `release:publish` (`--gate` or `--skip-gate`) |
| R-REL-4 | Ported Pele code carries MIT attribution in file headers and `THIRD_PARTY_NOTICES`. | Must | M1 | D12 | License check |
| R-REL-5 | Requirements, design, ADRs and tickets cross-reference each other by R-id. | Must | M1 | D36 | Review |

## 23. v12 track (R-V12)

| ID | Requirement | Pri | MS | Src | Acceptance |
| --- | --- | --- | --- | --- | --- |
| R-V12-1 | Land the frozen config snapshot (#8635) in v12. | Should | – | D44 | Merged |
| R-V12-2 | Evaluate making dagre the v12 default layout instead of ELK (at least a minor release). | Should | – | D44 | Decision record |

---

## 24. Open items and assumptions to confirm

- **O-1. Theme variable inventory.** v12 has about 270 theme variables. R-THEME-2 exposes "every variable a diagram uses". DESIGN must decide which ones are base and which derived, and how per-diagram variables (e.g. `pie1…pie12`, `git0…7`) map to CSS. Confirmed 2026-11-02: settled in DESIGN.
- **O-2. The other v12 themes.** v12 ships 11 themes. This draft makes the 5 documented ones Must and the rest Should (R-THEME-7). Resolved 2026-11-02: keep all 11 for parity; R-THEME-7 is now Must.
- **O-3. Parity-corpus location and licensing.** The 10,000+ diagram set lives outside the repo. Decided 2026-11-02: it is not run in CI. Quality assurance runs it; CI uses the in-repo corpora. Still open: where QA reads it from and whether any of it can be committed.
- **O-4. Reference runner.** R-PERF-7 needs a stable machine for per-stage regression checks. GitHub-hosted runners vary by ±20%.
- **O-5. HTML subset in labels.** R-TEXT-3 lists a minimal subset. Check the corpus for other tags in real use (`<sub>`, `<sup>`, `<u>`, `<a>`) before freezing the list.
- **O-6. Number targets.** R-PERF-9 (≤ 15 ms ready) and R-THEME-5 (≤ 8 base variables) are my proposals. Accepted 2026-11-02.
- **O-7. Pele layout: port or depend.** The layered layout (R-LAYOUT) is derived from Pele. Decide whether to port the code into core (we own and adapt it; MIT attribution per R-REL) or depend on Pele's published package (upstream fixes for free, but an external runtime dependency against R-PERF-2, and less control over the API and determinism). Decided 2026-11-02: port.

## 25. Open questions for alpha

These are out of scope for the draft implementation and must be resolved before the first alpha.

- **A-1. Images in labels.** v12 users put images in labels via `htmlLabels`. v13 can do this with SVG `<image>` laid out beside tspans (URLs through R-SEC-2/R-SEC-4). Decide the syntax, how size is given (core cannot fetch an image to measure it), and whether this is core or a plugin.
- **A-2. Release scope.** Which features a drop-in v13 install gives by default (R-COMPAT-10).
- **A-3. Security without a sanitizer.** R-SEC-1 drops DOMPurify and relies on the allow-list writer (R-SEC-2 to R-SEC-4). That is fine for the draft. Before alpha, verify it really is secure: an external security review, the v12 XSS/GHSA corpus plus fuzzing green, and a threat model covering plugins, themes/CSS variables, links and image URLs. If gaps remain, decide whether an optional sanitizer is needed.
