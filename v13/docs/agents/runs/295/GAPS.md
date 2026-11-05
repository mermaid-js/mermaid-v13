# Gaps — spec #295

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- ~~T0 #314 owns D293~~ Landed (`tickets/314.md`): `InlineProvider` = pair | `{ pattern: RegExp, box }`, the icon `FEATURES` entry (`ICON_NOT_RENDERED`, text output `ASCII_DROPPED` `feature: 'icon'`), `ExtensionPlugin.glyphs` → `RenderContext.icon(name, size, { fallbackPrefix })` (core fits xMidYMid meet), `DiagramPlugin.icons(model)` → `ResourceRequest.icons()`, `writeFragment` exported from `core/svg`. Other M4 work (mindmap, hand-drawn) and M5 consume it.
- ~~T0b #316 owns D294~~ Landed (`tickets/316.md`): `IconPacks` (`names`, `state`, `get`) and `IconifyJSON` types in core (`pipeline/icon-packs.ts`), `ResourceRequest.iconPacks`, `RenderContext.iconPacks`, `ExtensionClaim` `'icons'`; registry in `mermaid/src/icon-packs.ts`.
- ~~[I2 #322] `GlyphRequest` and `InlineRequest` carry no packs~~ Done in the review fixes (`tickets/314-316-review.md`): both have `iconPacks`. I1's resolver can use core's `IconifyJSON` instead of its own copy.
- ~~[I2 #322] Core is near the R-PERF-8 CDN budget~~ Review fixes: 89,895 B of 90,112 (217 B left).
- [I2 #322] From the review fixes: glyph providers fit their glyph into `req.size` themselves (exact numbers) and return an `SvgFragment`; I2 warns about `failed` packs (`IconPacks.error`, truncated) through the request's `warn`; I2 checks a pack's shape (`get()` is unchecked); `ICON_NOT_RENDERED` is deduped by code per render, first message wins.
- I1 #320 owns the pure resolver and body converter; I2 packages it. *Done in #320 (`tickets/320.md`); I2 takes the manifest, `private`, the changeset and the licenses `UPSTREAMS` entry.*

## Decisions made without the maintainer (also in the PR body)

- Review fixes (#314/#316): glyph fitting is the provider's; `iconPack` resources are the API object's (an extension cannot load its own); a provider with a `RegExp` `pattern` is a pattern provider even with `open`/`close`; feature not-rendered codes are deduped by code; `mermaid` no longer warns about failed packs.

- #320: `simplified` (→ `ICON_SIMPLIFIED`) also reports dropped drawing elements and references, not only `url()` paints. `tspan` is kept inside `text`. The package is private until I2.
- #316: an extension counts as the icons extension when it claims `icons` (`ExtensionClaim`). A registered `iconPack` resource need not be in `provides`; the API object loads it. `mermaid` warns `ICON_NOT_RENDERED` naming a failed pack; `renderSync` does not throw for it, `prepare()` retries. `preload({ iconPacks })` never rejects for a pack and ignores unknown names. `name` overrides `prefix` for `{ name, icons }` as well; registering a name again replaces it.
