# Gaps — spec #295

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Shared contracts

- ~~T0 #314 owns D293~~ landed on `feature/314_core-contract`: `InlineProvider.pattern`, the icon `FEATURES` entry (`ICON_NOT_RENDERED`), `ExtensionPlugin.glyphs` → `RenderContext.icon`, `DiagramPlugin.icons(model)`. Other M4 work (mindmap, hand-drawn) and M5 consume it; the API is in `tickets/314.md`.
- T0b #316 owns D294: the pack registry on the `mermaid` API object and `iconPack` resources. I2 #322 consumes it.
- I1 #320 owns the pure resolver and body converter; I2 packages it. *Done in #320 (`tickets/320.md`); I2 takes the manifest, `private`, the changeset and the licenses `UPSTREAMS` entry.*

## Decisions made without the maintainer (also in the PR body)

- #320: `simplified` (→ `ICON_SIMPLIFIED`) also reports dropped drawing elements and references, not only `url()` paints. `tspan` is kept inside `text`. The package is private until I2.
