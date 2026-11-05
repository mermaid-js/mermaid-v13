# Gaps — spec #295

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- ~~T0 #314 owns D293~~ Landed (`tickets/314.md`): `InlineProvider` = pair | `{ pattern: RegExp, box }`, the icon `FEATURES` entry (`ICON_NOT_RENDERED`, text output `ASCII_DROPPED` `feature: 'icon'`), `ExtensionPlugin.glyphs` → `RenderContext.icon(name, size, { fallbackPrefix })` (core fits xMidYMid meet), `DiagramPlugin.icons(model)` → `ResourceRequest.icons()`, `writeFragment` exported from `core/svg`. Other M4 work (mindmap, hand-drawn) and M5 consume it.
- ~~T0b #316 owns D294~~ Landed (`tickets/316.md`): `IconPacks` (`names`, `state`, `get`) and `IconifyJSON` types in core (`pipeline/icon-packs.ts`), `ResourceRequest.iconPacks`, `RenderContext.iconPacks`, `ExtensionClaim` `'icons'`; registry in `mermaid/src/icon-packs.ts`.
- ~~[I2 #322] `GlyphRequest` and `InlineRequest` carry no packs~~ Done in the review fixes (`tickets/314-316-review.md`): both have `iconPacks`. I1's resolver can use core's `IconifyJSON` instead of its own copy.
- ~~[I2 #322] Core is near the R-PERF-8 CDN budget~~ Review fixes: 89,895 B of 90,112 (217 B left).
- ~~[I2 #322] From the review fixes: glyph providers fit their glyph into `req.size` themselves (exact numbers) and return an `SvgFragment`; I2 warns about `failed` packs (`IconPacks.error`, truncated) through the request's `warn`; I2 checks a pack's shape (`get()` is unchecked); `ICON_NOT_RENDERED` is deduped by code per render, first message wins.~~ Done in #322 (`tickets/322.md`): fitted to 1e-6, failed packs named in the one `ICON_NOT_RENDERED` (error cut to 60), `get()` checked for an `icons` object, the first warning names every unresolved icon.
- I1 #320 owns the pure resolver and body converter; I2 packages it. *Done in #320 (`tickets/320.md`); the manifest, `private`, the changeset and the licenses `UPSTREAMS` entry done in #322.*
- ~~[I3 #324] Label icons with `currentColor` strokes draw in the CSS colour, not the label's.~~ Done in #324 (`tickets/324.md`): the plugin's `postRender` sets `color` to the label's inherited fill.
- [I4 #326] Flowchart warns `ICON_UNAVAILABLE` beside `ICON_NOT_RENDERED` for an unresolved shape icon (D299 alias). The e2e page (`packages/dev/src/adapter.ts`) now registers the plugin and static packs (#324), so icon-shape fixtures draw glyphs.

## Decisions made without the maintainer (also in the PR body)

- Review fixes (#314/#316): glyph fitting is the provider's; `iconPack` resources are the API object's (an extension cannot load its own); a provider with a `RegExp` `pattern` is a pattern provider even with `open`/`close`; feature not-rendered codes are deduped by code; `mermaid` no longer warns about failed packs.

- #324: `currentColor` strokes in label icons take the label colour through the plugin's `postRender` (core's writer cannot see an inherited fill; core is near R-PERF-8), so renders with the icons extension use the tree backing. The e2e page registers the plugin with v12 viewer.js's static packs plus a stroked `fal` stand-in.
- #322: `ICON_NOT_RENDERED`/`ICON_SIMPLIFIED` name the diagram's icons in the first (deduped) message, from what the last `missing()` saw; a pack-less glyph name only when met. Label `currentColor` fills inherit the label fill, strokes stay CSS `currentColor`. Glyph names split as v12's `stringToIcon` (dash form, `@provider`). Pele's notice is not required when every ported file comes from another upstream (`licenses.ts`). I1's pure functions are no longer exported.
- #320: `simplified` (→ `ICON_SIMPLIFIED`) also reports dropped drawing elements and references, not only `url()` paints. `tspan` is kept inside `text`. The package is private until I2.
- #316: an extension counts as the icons extension when it claims `icons` (`ExtensionClaim`). A registered `iconPack` resource need not be in `provides`; the API object loads it. `mermaid` warns `ICON_NOT_RENDERED` naming a failed pack; `renderSync` does not throw for it, `prepare()` retries. `preload({ iconPacks })` never rejects for a pack and ignores unknown names. `name` overrides `prefix` for `{ name, icons }` as well; registering a name again replaces it.

## From the #322 review (queued fix branch `fix/322_review`)

- [I2 #322] Packs named only through `fallbackPrefix` are never reported by `missing()` or loaded: `DiagramPlugin.icons()` names are split without the fallback, so `glyph('database', { fallbackPrefix: 'arch' })` warns "call prepare() first" forever. Latent until M5 architecture; `icons()` likely needs to carry the fallback per name.
- [I2 #322] Module-level WeakMaps carry `missing()` results to the draw (D294: no module state; `missing` meant to be pure). No leak found, but placeholder detection relies on `ResourceRequest.iconPacks` being the same object as the request views.
- [I2 #322] `ICON_NOT_RENDERED` text ends "Labels show them as written." even for shape-only failures. The warning path is O(n²) (`filter` + `findIndex`). `@:name` with a fallback differs from v12 `stringToIcon`. Licences: `REQUIRED_CREDITS` lacks `plugin-icons/src/{resolve,name}.ts`; the "Pele-derived files but no THIRD_PARTY_NOTICES" message misleads for Iconify-only packages.
