# Gaps — spec #295

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- ~~T0 #314 owns D293~~ Landed (`tickets/314.md`): `InlineProvider` = pair | `{ pattern: RegExp, box }`, the icon `FEATURES` entry (`ICON_NOT_RENDERED`, text output `ASCII_DROPPED` `feature: 'icon'`), `ExtensionPlugin.glyphs` → `RenderContext.icon(name, size, { fallbackPrefix })` (core fits xMidYMid meet), `DiagramPlugin.icons(model)` → `ResourceRequest.icons()`, `writeFragment` exported from `core/svg`. Other M4 work (mindmap, hand-drawn) and M5 consume it.
- ~~T0b #316 owns D294~~ Landed (`tickets/316.md`): `IconPacks` (`names`, `state`, `get`) and `IconifyJSON` types in core (`pipeline/icon-packs.ts`), `ResourceRequest.iconPacks`, `RenderContext.iconPacks`, `ExtensionClaim` `'icons'`; registry in `mermaid/src/icon-packs.ts`.
- [I2 #322] `GlyphRequest` and `InlineRequest` carry no packs: add `iconPacks` to each, filled from `ctx.iconPacks` (additive, ~1 line each in core), so providers reach the packs without module state. I1's resolver can use core's `IconifyJSON` instead of its own copy.
- [I2 #322] Core is near the R-PERF-8 CDN budget (90,112 B gz) after T0 + T0b: see "Size" below.
- I1 #320 owns the pure resolver and body converter; I2 packages it. *Done in #320 (`tickets/320.md`); I2 takes the manifest, `private`, the changeset and the licenses `UPSTREAMS` entry.*

## Decisions made without the maintainer (also in the PR body)

- #320: `simplified` (→ `ICON_SIMPLIFIED`) also reports dropped drawing elements and references, not only `url()` paints. `tspan` is kept inside `text`. The package is private until I2.
- #316: an extension counts as the icons extension when it claims `icons` (`ExtensionClaim`). A registered `iconPack` resource need not be in `provides`; the API object loads it. `mermaid` warns `ICON_NOT_RENDERED` naming a failed pack; `renderSync` does not throw for it, `prepare()` retries. `preload({ iconPacks })` never rejects for a pack and ignores unknown names. `name` overrides `prefix` for `{ name, icons }` as well; registering a name again replaces it.
