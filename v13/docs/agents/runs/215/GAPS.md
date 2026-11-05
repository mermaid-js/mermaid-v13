# Gaps — spec #215

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- T0 #237 owns the inline-box run kind and the delimiter-provider registry on the extension contract. M2 #245 consumes it; read `tickets/237.md`.
- T0b #238 owns plugin config fragments and the `layout` manifest kind (`"mermaid": { "plugin": "layout", "names": [...], "entry", "export"? }`, agreed with #218; #238 changes `readManifest`). E2 #240 and E4 #242 consume it; read `tickets/238.md`.
- E1 #239 owns the sync elkjs call; E2 builds the package on it. M1 #244 owns the MathJax TeX→SVG engine; M2 packages it.

## Contract gaps found by exploration (owner in brackets)

- [T0 #237] `SvgNode` (`core/src/svg/tree.ts:12`) is an index into a writer's tree and the stream writer has none, so a box run can't carry `node: SvgNode` at label-layout time. Needs a writer-independent form (writer callback or detached fragment). Report the chosen shape as a deviation from the ticket wording.
- [T0 #237 / M1 #244] The measurer has no x-height (`VerticalMetrics` = ascent, descent, lineHeight). MathJax `ex` → px needs a new metric or a fixed em ratio; M1 reports the options, T0 exposes what the provider needs.
- ~~[E1 #239] v12 develop pins elkjs 0.12.0; only 0.9.3 is on this machine.~~ Closed by #239: `packages/layout-elk` depends on elkjs 0.12.0; its dispatcher (`elk-worker.js:79543-79604`) matches 01's description (`239-elk-sync.md`).
- [E2 #240] Publishing `@mermaid-js/layout-elk` with `elkjs` needs a `THIRD_PARTY_ALLOWED` entry in `tools/check-deps` and elkjs's EPL-2.0/GPL-3.0 notice. elkjs output carries GWT `$H` hash counters, which differ run to run: never read them or let them reach the SVG. Web Worker hosts are unsupported (elkjs binds `self.onmessage`, as in v12) (`239-elk-sync.md`).
- [E2 #240] v12 develop registers 7 layout names; D171 lists 9 (`elk.layered`, `elk.radial` were only per-container ids in v12). Register all 9 as D171 says.
- [E3 #241 / E4 #242] `api.ts:557-563` calls the engine with no `LayoutContext`, and `LayoutGraph` carries no config or node metadata, so `elk.*` keys and `@{ algorithm }` can't reach the engine. DESIGN §6.1 already has `(g, ctx)`; E3 plumbs `ctx` (with the resolved config), E4 uses it.
- [M2 #245] `loadResources` (`api.ts:295`) handles only layout, theme and diagram; extension plugins have no resources hook, so a `math` resource is never loaded. M2 adds it (check #218 doesn't already).
- [E5 #243] Text output uses the SVG layout name and throws `NotLoadedError` when that engine isn't loaded; D179 needs ascii to always use `layered`.

## Waiting on #218

- Activates-on-install checks (E2, E5, M3) need #218 T4 (#226). S1 #247 needs #218 T0 (#220).
