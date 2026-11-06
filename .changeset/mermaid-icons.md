---
'mermaid': patch
---

feat: `registerIconPacks([{ name, icons }])` and `registerIconPacks([{ name, loader }])` register Iconify JSON packs on the API object (one registry per `createMermaid()`; `name` overrides the pack's `prefix`), for `@mermaid-js/plugin-icons` to draw. A loader runs only when a diagram names its pack, in `prepare()`/`render()`, or up front with `preload({ iconPacks: ['fa'] })`; `renderSync` before then throws `NotLoadedError` naming the pack, or draws placeholders with `placeholders: true`. A loader that rejects does not fail the render: its icons are not drawn, and the next `prepare()` retries it. While packs are registered and no extension claims `icons`, every render warns `ICON_PACKS_UNSUPPORTED`. Types `IconLoader`, `AsyncIconLoader`, `SyncIconLoader`, `IconifyJSON`, `IconifyIcon`, `IconifyAlias`, `IconPacks` and `IconPackState`.
