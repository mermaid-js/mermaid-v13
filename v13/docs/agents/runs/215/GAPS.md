# Gaps — spec #215

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- T0 #237 owns the inline-box run kind and the delimiter-provider registry on the extension contract. M2 #245 consumes it; read `tickets/237.md`.
- T0b #238 owns plugin config fragments and the `layout` manifest kind (`"mermaid": { "plugin": "layout", "names": [...], "entry", "export"? }`, agreed with #218; #238 changes `readManifest`). E2 #240 and E4 #242 consume it; read `tickets/238.md`.
- E1 #239 owns the sync elkjs call; E2 builds the package on it. M1 #244 owns the MathJax TeX→SVG engine; M2 packages it.

## Contract gaps found by exploration (owner in brackets)

- ~~[T0 #237] `SvgNode` can't be carried by a box run~~ Closed by #237: a box's `node` is a detached `SvgFragment` (`{ tag, attrs, children }`) the writer replays through its primitives (deviation from the ticket's `node: SvgNode`).
- ~~[T0 #237 / M1 #244] no x-height for ex → px~~ Closed by #237: `InlineRequest` carries `font`, `metrics` and `ex = 0.5 × font.size`; M1 may ask for a real x-height (see `tickets/237.md`).
- [E1 #239] v12 develop pins elkjs 0.12.0; only 0.9.3 is on this machine (via the `mermaid@12.2.0` oracle). The dispatcher pointers in `01-v12-elk.md` are from 0.9.3.
- [E2 #240] v12 develop registers 7 layout names; D171 lists 9 (`elk.layered`, `elk.radial` were only per-container ids in v12). Register all 9 as D171 says.
- [E3 #241 / E4 #242] `api.ts:557-563` calls the engine with no `LayoutContext`, and `LayoutGraph` carries no config or node metadata, so `elk.*` keys and `@{ algorithm }` can't reach the engine. DESIGN §6.1 already has `(g, ctx)`; E3 plumbs `ctx` (with the resolved config), E4 uses it.
- [M2 #245] `loadResources` (`api.ts:295`) handles only layout, theme and diagram; extension plugins have no resources hook, so a `math` resource is never loaded. M2 adds it (check #218 doesn't already).
- [E5 #243] Text output uses the SVG layout name and throws `NotLoadedError` when that engine isn't loaded; D179 needs ascii to always use `layered`.

## Waiting on #218

- Activates-on-install checks (E2, E5, M3) need #218 T4 (#226). S1 #247 needs #218 T0 (#220).
