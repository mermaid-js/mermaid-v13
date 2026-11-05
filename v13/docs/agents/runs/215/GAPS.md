# Gaps — spec #215

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- T0 #237 owns the inline-box run kind and the delimiter-provider registry on the extension contract. M2 #245 consumes it; read `tickets/237.md`.
- T0b #238 owns plugin config fragments and the `layout` manifest kind (`"mermaid": { "plugin": "layout", "names": [...], "entry", "export"? }`, agreed with #218; #238 changes `readManifest`). E2 #240 and E4 #242 consume it; read `tickets/238.md`.
- E1 #239 owns the sync elkjs call; E2 builds the package on it. M1 #244 owns the MathJax TeX→SVG engine; M2 packages it.

## Contract gaps found by exploration (owner in brackets)

- ~~[T0 #237] `SvgNode` can't be carried by a box run~~ Closed by #237: a box's `node` is a detached `SvgFragment` (`{ tag, attrs, children }`) the writer replays through its primitives (deviation from the ticket's `node: SvgNode`).
- ~~[T0 #237 / M1 #244] no x-height for ex → px~~ Closed by #237: `InlineRequest` carries `font`, `metrics` and `ex = 0.5 × font.size`; M1 may ask for a real x-height (see `tickets/237.md`). #244: 0.5 is good enough (math em 1.13× the label font; v12 KaTeX 1.21×), no x-height metric needed (`244-mathjax.md`).
- ~~[E1 #239] v12 develop pins elkjs 0.12.0; only 0.9.3 is on this machine.~~ Closed by #239: `packages/layout-elk` depends on elkjs 0.12.0; its dispatcher (`elk-worker.js:79543-79604`) matches 01's description (`239-elk-sync.md`).
- [E2 #240] Publishing `@mermaid-js/layout-elk` with `elkjs` needs a `THIRD_PARTY_ALLOWED` entry in `tools/check-deps` and elkjs's EPL-2.0/GPL-3.0 notice. elkjs output carries GWT `$H` hash counters, which differ run to run: never read them or let them reach the SVG. Web Worker hosts are unsupported (elkjs binds `self.onmessage`, as in v12) (`239-elk-sync.md`).
- [M2 #245] (from the #237 review) A registered `$$` provider that declines (engine not loaded) shows raw TeX with no warning: `inlineSpans` warns only when no provider claims the delimiter. M2 must throw `NotLoadedError` naming `math` in `renderSync`, or warn in placeholder mode (D178).
- [M3 #246] (from #237) Only flowchart passes `ctx.inline` to `layoutLabel`; class, state, ER and sequence neither draw boxes nor warn `MATH_NOT_RENDERED`. Class's single-run form (`render.ts:389`) must skip box runs. Text output gives no warning yet (D179 `ASCII_DROPPED`).
- [E2 #240] v12 develop registers 7 layout names; D171 lists 9 (`elk.layered`, `elk.radial` were only per-container ids in v12). Register all 9 as D171 says.
- [E3 #241 / E4 #242] `api.ts:557-563` calls the engine with no `LayoutContext`, and `LayoutGraph` carries no config or node metadata, so `elk.*` keys and `@{ algorithm }` can't reach the engine. DESIGN §6.1 already has `(g, ctx)`; E3 plumbs `ctx` (with the resolved config), E4 uses it.
- [M2 #245] The engine (`plugin-math/src/engine.ts`, #244) is 677 KB gz only when MathJax's `#default-font/*` package import is aliased to `@mathjax/mathjax-tex-font` in the build (1,034 KB gz otherwise). Decide whether that size is acceptable (font variants could load lazily). Publishing needs `THIRD_PARTY_ALLOWED` entries for `@mathjax/src` and `@mathjax/mathjax-tex-font` (Apache-2.0) and a NOTICE. Characters outside the TeX font come out as `<text>` with a guessed width: measure them or refuse them (`244-mathjax.md`).
- [M2 #245] Size default (orchestrator): build with the `#default-font/*` → `@mathjax/mathjax-tex-font` alias (677 KB gz, as MathJax's own builds do); report the size, no gate (spec "Testing Decisions"). Raised to Knut for acceptance.
- [M3 #246] (from #244) MathJax macros persist across formulas (breaks R-ARCH-6), so `\def`, `\newcommand`, `\href`, `\style`, `\class` and `\tag` are unsupported; KaTeX texvc names, `\relax` and `\phase` are mapped. MIGRATION.md must list them. Observation: with `fontFamily: courier` + `deterministic: true`, text after a math box can overlap the next box in Chromium, because the courier table is narrower than the browser's Courier (a measurer property, not the box placement).
- [M2 #245] `loadResources` (`api.ts:295`) handles only layout, theme and diagram; extension plugins have no resources hook, so a `math` resource is never loaded. M2 adds it (check #218 doesn't already).
- [E5 #243] Text output uses the SVG layout name and throws `NotLoadedError` when that engine isn't loaded; D179 needs ascii to always use `layered`.

## From E2 #240

- [E4 #242] `elk.radial` (registered per D171; v12 never had it as a layout name) throws ELK's "not a tree" error on a graph with a cycle or several roots, so the render fails. Match v12's per-container behaviour or fall back to `layered` with a warning; escalate if neither fits.
- [E5 #243] With `layout: elk` and the plugin, text output gets ELK's px coordinates (the engine ignores `grid`); without the plugin it gets `ELK_NOT_INSTALLED`. D179: always `layered`, one `ASCII_DROPPED`. The package has no README yet.
- [T0b #238] The manifest E2 wants: `{"plugin":"layout","names":[the 9 names],"entry":"./dist/index.js"}` (`tickets/240.md`).

## Waiting on #218

- Activates-on-install checks (E2, E5, M3) need #218 T4 (#226). S1 #247 needs #218 T0 (#220).
