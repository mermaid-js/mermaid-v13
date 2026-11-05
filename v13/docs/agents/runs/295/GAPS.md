# Gaps — spec #295

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- T0 #314 owns D293: `InlineProvider.pattern`, the icon `FEATURES` entry (`ICON_NOT_RENDERED`), `ExtensionPlugin.glyphs` → `RenderContext.icon`, `DiagramPlugin.icons(model)`. Other M4 work (mindmap, hand-drawn) and M5 consume it; read `tickets/314.md` once merged.
- T0b #316 owns D294: the pack registry on the `mermaid` API object and `iconPack` resources. I2 #322 consumes it. *Done in #316 (`tickets/316.md`). Open: `GlyphRequest`/`InlineRequest` need `iconPacks` (from `ctx.iconPacks`) once T0 merges, so providers reach the packs; owner T0 follow-up or I2.*
- I1 #320 owns the pure resolver and body converter; I2 packages it. *Done in #320 (`tickets/320.md`); I2 takes the manifest, `private`, the changeset and the licenses `UPSTREAMS` entry.*

## Decisions made without the maintainer (also in the PR body)

- #320: `simplified` (→ `ICON_SIMPLIFIED`) also reports dropped drawing elements and references, not only `url()` paints. `tspan` is kept inside `text`. The package is private until I2.
- #316: an extension counts as the icons extension when it claims `icons` (`ExtensionClaim`). A registered `iconPack` resource need not be in `provides`; the API object loads it. `mermaid` warns `ICON_NOT_RENDERED` naming a failed pack; `renderSync` does not throw for it, `prepare()` retries. `preload({ iconPacks })` never rejects for a pack and ignores unknown names. `name` overrides `prefix` for `{ name, icons }` as well; registering a name again replaces it.
